const fs = require("fs");
const path = require("path");
const request = require("request");
const mkdirp = require("mkdirp");
const commandLineArgs = require("command-line-args");
const XLSX = require("xlsx");
const { execSync } = require("child_process");

const { shuffle, isURL } = require("./utils");

const API_URL = "https://api.cofacts.tw/graphql";
// const API_URL = "https://dev-api.cofacts.tw/graphql";

const DIST = {
  path: "dist",
  filename: {
    "BOTH": "articles.xlsx",
    "FEEDBACK": "articles-feedback.xlsx",
    "REPLY": "articles-reply.xlsx",
  }
};

const MODE = {
  BOTH: "BOTH",
  FEEDBACK: "FEEDBACK",
  REPLY: "REPLY",
}

const optionDefinitions = [
  {
    name: "people",
    alias: "p",
    type: Number,
    defaultValue: 2
  },
  {
    name: "replyorfeedback",
    alias: "n",
    type: Number,
    description: 'Number of articles which has no replies or reply has no positive feedbacks.'
  },
  {
    name: "feedback",
    alias: "f",
    type: Number,
    description: 'Number of articles which reply has no positive feedbacks.'
  },
  {
    name: "reply",
    alias: "r",
    type: Number,
    description: 'Number of articles which has no replies.'
  },
  {
    name: "distribution",
    alias: "d",
    type: Distribution,
    multiple: true
  },
  {
    name: "xlsx",
    alias: "x",
    type: String,
    description: 'File path of attendee list downloading form kktix, use this file to rename tabs name as attendees\'.'
  },
  {
    name: "backup",
    alias: "b",
    type: Number,
    description: 'Number of extra seats generate form xlsx file. Default is 2.'
  },
];

function Distribution(assign) {
  if (!(this instanceof Distribution)) return new Distribution(assign);
  const pair = assign.match(/(\d+):(\d+)/);
  this.number = parseInt(pair[1]);
  this.people = parseInt(pair[2]);
}

const listArticleFields = `
  edges {
    node {
      id
      text
      hyperlinks {
        url
        title
      }
      replyCount
    }
  }
`;

async function getNotRepliedArticlesByOrder(amount, order) {
  return new Promise((resolve, reject) => {
    request.post(
      {
        url: API_URL,
        json: {
          query: `{
          ListArticles (first: ${amount}, orderBy: ${order}, filter: {replyCount: {EQ: 0}}) {
            ${listArticleFields}
          }
        }`,
          operationName: null,
          variables: null
        }
      },
      function (error, response, body) {
        if (!error && response.statusCode == 200) {
          resolve(body.data.ListArticles.edges.map(item => item.node));
        } else {
          reject(error);
        }
      }
    );
  });
}

async function getNoFeedbackRepliedArticles(amount) {
  return new Promise((resolve, reject) => {
    request.post(
      {
        url: API_URL,
        json: {
          query: `{
          ListArticles (
            first: ${amount}
            orderBy: {createdAt: DESC}
            filter: {replyCount: {GTE: 1}
            hasArticleReplyWithMorePositiveFeedback: false
          }) {
            ${listArticleFields}
          }
        }`,
          operationName: null,
          variables: null
        }
      },
      function (error, response, body) {
        if (!error && response.statusCode == 200) {
          resolve(body.data.ListArticles.edges.map(item => item.node));
        } else {
          reject(error);
        }
      }
    );
  });
}

function getArticleText({ text, hyperlinks }) {
  return (hyperlinks || []).reduce(
    (replacedText, hyperlink) =>
      hyperlink.title ? replacedText.replace(hyperlink.url, `[${hyperlink.title}](${hyperlink.url})`) : replacedText,
    text.replace(/\n|\r/g, ' ')
  )
}

function getArticleState({ replyCount }) {
  return replyCount > 0 ? '🈶' : '🆕';
}

function AddHyperlinkToURL(worksheet) {
  return Object.keys(worksheet).reduce((acc, key) => {
    const cell = worksheet[key];
    if (cell !== null && typeof cell === "object" && isURL(cell.v)) {
      cell.l = {
        Target: cell.v,
        Tooltip: cell.v
      };
    }
    acc[key] = worksheet[key];

    return acc;
  }, {});
}

function getDuplicateNameIdx(attendeeNameIdMap) {
  const nameIndexMap = attendeeNameIdMap.reduce((acc, cur, idx) => {
    acc[cur[0]] = acc[cur[0]] || [];
    acc[cur[0]].push(idx);
    return acc;
  }, []);

  return Object.keys(nameIndexMap).reduce((acc, cur) =>
    acc.concat(nameIndexMap[cur].length > 1 ? nameIndexMap[cur] : []), []);
}

async function generateNeedToCheckList(distribution, mode, attendeeData = []) {
  let newest = [];
  let mostAsked = [];
  let repliedButNotEnoughFeedback = [];

  const amount = distribution.reduce(
    (acc, cur) => (acc += cur.number * cur.people),
    0
  );

  if (mode !== MODE.FEEDBACK) {
    newest = await getNotRepliedArticlesByOrder(amount, "{createdAt: DESC}");
    console.log(`Fetched ${newest.length} latest not-replied articles.`);

    mostAsked = await getNotRepliedArticlesByOrder(
      amount,
      "{replyRequestCount: DESC}"
    );
    console.log(`Fetched ${newest.length} most-asked not-replied articles.`)
  }

  if (mode !== MODE.REPLY) {
    repliedButNotEnoughFeedback = await getNoFeedbackRepliedArticles(amount);
    console.log(`Fetched ${repliedButNotEnoughFeedback.length} replied articles with not enough feedback.`)
  }

  let articleIds = shuffle(
    Array.from(new Set([...newest, ...mostAsked].map(({ id }) => id)))
  ).slice(0, amount);

  if (articleIds.length < amount) {
    const articleIdsWithRepliedIds = [...articleIds, ...repliedButNotEnoughFeedback.map(({ id }) => id)];
    articleIds = shuffle(articleIdsWithRepliedIds.slice(0, amount));
  }

  try {
    if (articleIds.length < amount) {
      throw new Error(
        `Only ${articleIds.length
        } articles available, but you requested total ${amount} articles. Please adjsut your params.`
      );
    }
  } catch (e) {
    console.error(e);
    return;
  }

  const idToArticle = [...newest, ...mostAsked, ...repliedButNotEnoughFeedback].reduce((map, node) => {
    map[node.id] = node;
    return map;
  }, {});

  const flat = distribution.reduce(
    (acc, cur) => acc.concat(Array(cur.people).fill(cur.number)),
    []
  );

  const jsons = flat.map((num, idx) => {
    const cursor = flat.slice(0, idx).reduce((acc, cur) => (acc += cur), 0);
    return articleIds.slice(cursor, cursor + num).map((articleId, idx) => ({
      ID: idx + 1,
      State: getArticleState(idToArticle[articleId]),
      Link: `https://cofacts.tw/article/${articleId}`,
      Text: getArticleText(idToArticle[articleId]),
      Done: ""
    }));
  });

  // return [name, emailId]
  const attendeeNameIdMap = attendeeData.map((data) => {
    const nickName = data["希望被別人稱呼的方式或名稱"];
    const name = data["Name"].length == 3 ? data["Name"].substr(1, 2) : data["Name"];
    const id = data["Email"].split("@")[0];
    return [(nickName ? nickName.trim() : name.trim()), id.trim()];
  });

  const duplicateIndex = getDuplicateNameIdx(attendeeNameIdMap || []);

  const sheetNames = flat.map((num, idx) => attendeeNameIdMap.length > 0 ?
    // concat the name with emailId if it is a duplicate name.
    (duplicateIndex.includes(idx) ?
      attendeeNameIdMap[idx][0] + " (" + attendeeNameIdMap[idx][1] + ")" :
      attendeeNameIdMap[idx][0]) :
    `No. ${idx + 1}`);

  const workbook = {
    SheetNames: sheetNames,
    Sheets: sheetNames.reduce((acc, cur, idx) => {
      return Object.assign({}, acc, {
        [sheetNames[idx]]: AddHyperlinkToURL(XLSX.utils.json_to_sheet(jsons[idx]))
      });
    }, {})
  };

  const timestamp = new Date()
    .toISOString()
    .replace(/:|-|T/g, "")
    .split(".")[0];
  mkdirp.sync(DIST.path);

  const fileName = `${timestamp}-${DIST.filename[mode]}`;
  const filePath = path.resolve(DIST.path)
  XLSX.writeFileAsync(
    path.resolve(DIST.path, fileName),
    workbook,
    () => {
      console.log(`File "${fileName}" has been saved to: ${filePath}`);

      distribution.forEach(function (el) {
        console.log(`=> ${el.number} articles for ${el.people} people`);
      });

      console.log(`🔜  Next step: visit https://sheets.new and choose File>Import to import ${fileName}`);
      execSync(`open ${filePath}`);
    }
  );
}

async function main() {
  const options = commandLineArgs(optionDefinitions);

  let attendeeData = [];
  if (options.xlsx) {
    const wb = XLSX.readFile(options.xlsx);

    attendeeData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
      // filter out cancelled attendee and duplicate attendee with same email
      .reduce((acc, cur) => {
        if (cur["Ticket Status"] == "activated" &&
          !Object.values(acc).find(e => e['Email'] === cur["Email"]))
          acc.push(cur);
        return acc;
      }
        , []);

    const backupSeat = options.backup || 2;
    for (let i = 0; i < backupSeat; i++) {
      const backup = { ...attendeeData[0] };
      backup["希望被別人稱呼的方式或名稱"] = `備用${i + 1}`;
      backup["Email"] = `backup${i + 1}@cofacts.tw`;
      attendeeData.push(backup);
    }
  }

  const people = attendeeData.length || options.people;

  if (options.replyorfeedback)
    await generateNeedToCheckList([Distribution(`${options.replyorfeedback}:${people}`)], MODE.BOTH, attendeeData);
  if (options.feedback)
    await generateNeedToCheckList([Distribution(`${options.feedback}:${people}`)], MODE.FEEDBACK, attendeeData);
  if (options.reply)
    await generateNeedToCheckList([Distribution(`${options.reply}:${people}`)], MODE.REPLY, attendeeData);
  if (options.distribution)
    await generateNeedToCheckList(options.distribution, MODE.BOTH);
}

(async () => main())();

