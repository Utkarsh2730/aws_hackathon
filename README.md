**Team:** Solo

**Creator:** Utkarsh Sonthalia
# Code Buddy

**A code reviewer for people who are new to programming.** Paste your code and get a kind, plain-English review that explains *why* each problem matters, shows you the corrected code with the changed lines highlighted, and keeps track of the habits you are still working on.

> **Short description (for forms):** Code Buddy reviews a beginner's code in plain English, in English or Hindi, shows the corrected code with every changed line highlighted, reads the review aloud, and remembers which habits the learner keeps getting wrong so they can see themselves improve. Built on AWS Lambda and Amazon Polly.

## The problem

Beginners get stuck on mistakes they cannot name: an off-by-one loop, `=` instead of `==`, a shared default list. Teachers and TAs do not scale, and a general chatbot will explain almost anything if you already know what to ask, but it does not remember you, does not check that you fixed the problem, and hands over answers that students copy without learning.

## What it does

- **Plain-English review.** Each issue has a severity (bug, security, style, tip), the line it is on, and *why it matters*, written for a beginner.
- **Learn first, then see the answer.** Suggested fixes stay hidden until you ask for them.
- **Suggest fix.** Shows your same code with the fixes applied. The old line is struck through in red, the new line is highlighted in green, and each change says which issue it fixes.
- **Check my fix.** Edit your code, press the button, and it compares against your last review ("Issues: 3 → 1. Fixed: Loop boundaries").
- **Where to improve.** Groups the mistakes into the *habits* behind them (for example "Loop boundaries") with 2 to 3 practical steps for each.
- **Skill map.** Remembers, in the learner's own browser, which habits keep coming up and which ones they have fixed.
- **Hindi explanations.** The whole review can be explained in Hindi. Buttons and labels stay in English.
- **Read aloud.** Spoken with Amazon Polly (Indian English or Hindi voice).
- **Everywhere.** Light, dark and system themes, a layout for phones and tablets, keyboard and screen-reader support.

## Architecture

```
Browser ── HTTPS ──▶ Lambda Function URL ──▶ AWS Lambda (Node.js 22)
 (one page)            (public, no login)      │
                                               ├─ GET /        serves the page
                                               ├─ POST /review runs the review engine
                                               └─ POST /speak  ─▶ Amazon Polly (neural voices)
```

**AWS services used:** AWS Lambda, Lambda Function URLs, AWS IAM, Amazon CloudWatch Logs, AWS CloudFormation, and Amazon Polly.

The whole app is one CloudFormation stack (`template.yaml`) and one Lambda function. There is no database, no servers to manage, and deleting the stack removes everything.

### The review engine

16 beginner-focused pattern checks for Python, JavaScript, Java and C, plus language-independent checks for hard-coded secrets and SQL built by joining text. Each check knows the habit behind the mistake and what to say in plain English and in Hindi. 13 of the 16 can also rewrite the line automatically, which powers **Suggest fix**. The other three (SQL injection, `eval` and hard-coded secrets) need a decision only the coder can make, so the page points to the suggested fix instead. The page labels each review "Reviewed by built-in checks".

## Honest status

- **The review engine is a set of rules, not an AI model.** It finds well-known beginner mistakes and can miss others, or be wrong. That is the reason for the label and the "Reviews can be wrong" line on the page.
- **Hindi text was written by the developer** and has not been reviewed by a native speaker.
- **Some issues cannot be fixed automatically** (SQL injection, `eval`, secrets): the page says so and points to the suggested fix for each.
- Tested locally against the review engine and page scripts. The Lambda handler itself is exercised by the self-test that `deploy.sh` runs after deployment.

## Privacy and safety

- The learner's code is sent to the Lambda only to produce the review, and the function does not store it. The skill map lives only in the learner's browser.
- Requests are capped (300 lines, 20,000 characters). The public URL has no login, so anyone with the link can use it. The account's Lambda concurrency limit and these caps bound the cost.
- The Lambda's IAM role is scoped to specific actions and has no administrator access.

## Cost

About $0 for light use: Lambda and CloudFormation are inside the free tier. Amazon Polly is the only real cost, at most about 2 cents for a full read-aloud, and each review's audio is fetched once and replayed from the browser.

## Run and deploy

Requires the AWS CLI with credentials, and `zip`.

```
./deploy.sh rules      # deploy the app
```

It creates the `code-buddy` stack in `ap-northeast-1`, uploads the code, prints the URL, and runs a short self-test of the page, the review endpoint and read aloud. To remove everything:

```
aws cloudformation delete-stack --region ap-northeast-1 --stack-name code-buddy
```

## Project layout

```
template.yaml      CloudFormation: Lambda, Function URL, IAM role, log group
deploy.sh          deploy, upload code, self-test
src/index.mjs      Lambda handler: page, /review, /speak
src/rules.mjs      the built-in checks, corrected-code generation, habit grouping
src/i18n.mjs       Hindi explanations for the built-in checks
src/index.html     the whole front end (HTML, CSS, JavaScript in one file)
```

## Built with

Built with Claude Code as a development assistant: to test whether the idea made sense for education, to work out what beginners get stuck on and what a chatbot does not do for them, and to test the code.

## What we would do next

Add a language-model review engine to catch mistakes beyond the built-in checks, add more Indian languages with native-speaker review, let teachers see a class's most common habits, and put the page behind CloudFront and a custom domain.

## A two-minute demo

1. Open the page. It already shows an example review of the sample code.
2. Point at the severity marks in the gutter and click an issue: its line lights up.
3. Click **Suggest fix**: the same code with the old line struck through and the new line highlighted.
4. Edit the code, click **Check my fix**: "Issues: 3 → 1".
5. Scroll to **Where to improve** and the **Skill map**: the habits behind the mistakes.
6. Switch to **हिन्दी में समझाएँ**, then press **Read aloud**.
7. Close with the honest note: the built-in checks catch the well-known beginner mistakes, and the page says so.

Link-https://7cbenbwhuie65xeeogdsr3hery0vemit.lambda-url.ap-northeast-1.on.aws/
