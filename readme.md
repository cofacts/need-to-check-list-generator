# Need to Check List Generator

The script to generate the list of need-to-check articles in order to dispatch tasks in our fact-checking meetup.

## How to use

Run with node above v7

```bash
# Equally distribution
npm start -- -p <number of people> -n <number of articles per person>

npm start -- -p <number of people> -f <number of articles per person> -r <number of articles per person>

npm start -- -p <number of people> -f <number of articles per person>

npm start -- -p <number of people> -r <number of articles per person>

# Specify distribution
npm start -- -d <number of articles>:<number of people> -d <number of articles>:<number of people> ...

# Options
-p, --people        Number of people to distribute articles.
-n, --number        Number of articles which has no replies or reply has no positive feedbacks.
-r, --rnumber       Number of articles which has no replies.
-f, --fnumber       Number of articles which reply has no positive feedbacks.

-d, --distribution  Specify distribution <n:p>, not support rnumber and fnumber.
```

## Todo

- Update to google drive automaticlly.
