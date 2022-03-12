# Need to Check List Generator

The script to generate the list of need-to-check articles in order to dispatch tasks in our fact-checking meetup.

## How to use

Run with node above v7

```bash
# Equally distribution
npm start -- -p <number of people> -n <number of articles per person>
npm start -- -x <xlsx file path> -n <number of articles per person> 

npm start -- -p <number of people> -f <number of articles per person> -r <number of articles per person>
npm start -- -x <xlsx file path> -f <number of articles per person> -r <number of articles per person> 

npm start -- -p <number of people> -f <number of articles per person>

npm start -- -p <number of people> -r <number of articles per person>

# Specify distribution
npm start -- -d <number of articles>:<number of people> -d <number of articles>:<number of people> ...

# Options
-p, --people            Number of people to distribute articles, will be replaced by -x option.
-n, --replyorfeedback   Number of articles which has no replies or reply has no positive feedbacks.
-r, --reply             Number of articles which has no replies.
-f, --feedback          Number of articles which reply has no positive feedbacks.

-x, --xlsx              File path of attendee list downloading form kktix, use this file to rename tabs name as attendees.
-b, --backup            Number of extra seats generate form xlsx file. Default is 2. 

-d, --distribution  Specify distribution <n:p>, not support feedback, reply and xlsx.
```

## Todo

- Update to google drive automaticlly.
