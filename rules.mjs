// Beginner-friendly pattern checks. Used when Amazon Bedrock is unavailable.
// These are simple line-by-line heuristics, NOT a language model - they only catch well-known mistakes.

import { I18N } from './i18n.mjs';

const SEVERITY_ORDER = { bug: 0, security: 1, style: 2, tip: 3 };

const RULES = [
  {
    langs: ['python'], severity: 'bug',
    test: (l) => /range\(\s*len\([^)]*\)\s*\+\s*1\s*\)/.test(l),
    apply: (l) => ({ line: l.replace(/range\(\s*(len\([^)]*\))\s*\+\s*1\s*\)/, 'range($1)') }),
    id: 'py-range-plus-one',
    topic: 'Loop boundaries',
    title: 'The loop goes one step too far',
    explanation: 'A list with 5 items has positions 0 to 4. range(len(x) + 1) also counts position 5, which does not exist, so the last loop crashes with an IndexError.',
    fix: 'for i in range(len(items)):\n    ...',
  },
  {
    langs: ['python'], severity: 'bug',
    test: (l) => /\bdef\s+\w+\([^)]*=\s*(\[\]|\{\}|set\(\))/.test(l),
    apply: (l) => {
      const m = l.match(/^(\s*)def\s+\w+\(([^)]*)\)\s*:\s*$/);
      if (!m) return null;
      const after = [];
      const params = m[2].replace(/(\w+)\s*=\s*(\[\]|\{\}|set\(\))/g, (_, name, lit) => {
        after.push(`${m[1]}    if ${name} is None:`, `${m[1]}        ${name} = ${lit}`);
        return `${name}=None`;
      });
      return { line: l.replace(m[2], params), after };
    },
    id: 'py-mutable-default',
    topic: 'Shared default values (mutability)',
    title: 'A list or dict as a default value is shared between calls',
    explanation: 'Python creates the default value only once. Every call that uses the default adds to the same list, so items from earlier calls "leak" into later ones.',
    fix: 'def add_item(item, basket=None):\n    if basket is None:\n        basket = []\n    basket.append(item)\n    return basket',
  },
  {
    langs: ['python'], severity: 'bug',
    test: (l) => /^\s*(if|elif|while)\s+[^=<>!]+(?<![=!<>:])=(?!=)[^:]*:\s*$/.test(l),
    apply: (l) => ({ line: l.replace(/^(\s*(?:if|elif|while)\s+[^=<>!]+?)\s=\s/, '$1 == ') }),
    id: 'py-assign-in-cond',
    topic: 'Assignment vs comparison',
    title: 'One "=" where you probably meant "=="',
    explanation: 'A single = stores a value in a variable. To ask "are these equal?" you need two: ==. Python refuses to run this line and reports a SyntaxError.',
    fix: 'if x == 5:',
  },
  {
    langs: ['python'], severity: 'bug',
    test: (l) => /^\s*except\s*:/.test(l),
    apply: (l) => ({ line: l.replace(/except\s*:/, 'except Exception:') }),
    id: 'py-bare-except',
    topic: 'Handling errors precisely',
    title: 'A bare "except:" hides every kind of error',
    explanation: 'It catches everything, even typos and Ctrl+C, so real bugs disappear silently. Name the error you expect instead.',
    fix: 'except ValueError:\n    ...',
  },
  {
    langs: ['python'], severity: 'style',
    test: (l) => /[=!]=\s*None\b/.test(l),
    apply: (l) => ({ line: l.replace(/!=\s*None\b/, 'is not None').replace(/==\s*None\b/, 'is None') }),
    id: 'py-none-eq',
    topic: 'Readability and conventions',
    title: 'Compare with None using "is"',
    explanation: 'None is a single special object, so Python programmers check it with is / is not. It is the standard, safer habit.',
    fix: 'if value is None:',
  },
  {
    langs: ['python'], severity: 'tip',
    test: (l) => /\/\s*len\(/.test(l),
    apply: (l) => {
      const arg = l.match(/\/\s*len\((\w+)\)/);
      if (!arg || !/^\s*return\b/.test(l)) return null;
      const indent = l.match(/^\s*/)[0];
      return { before: [`${indent}if not ${arg[1]}:`, `${indent}    return 0`] };
    },
    id: 'py-div-len',
    topic: 'Edge cases (empty or missing input)',
    title: 'Dividing by len() fails on an empty list',
    explanation: 'If the list is empty, len() is 0 and Python raises a ZeroDivisionError. Check for that case first.',
    fix: 'if not nums:\n    return 0',
  },
  {
    langs: ['js'], severity: 'style',
    test: (l) => /^\s*var\s+/.test(l),
    apply: (l) => ({ line: l.replace(/^(\s*)var\s+/, '$1let ') }),
    id: 'js-var',
    topic: 'Modern JavaScript habits',
    title: 'Prefer let or const over var',
    explanation: 'var has surprising scoping rules that cause confusing bugs. Use const for values that do not change and let for ones that do.',
    fix: 'const name = "Ada";',
  },
  {
    langs: ['js'], severity: 'tip',
    test: (l) => /[^=!<>]==[^=]/.test(l) && !/["'].*==.*["']/.test(l),
    apply: (l) => ({ line: l.replace(/([^=!<>])==(?!=)/g, '$1===') }),
    id: 'js-loose-eq',
    topic: 'Modern JavaScript habits',
    title: 'Prefer === over ==',
    explanation: '== quietly converts types before comparing (so "5" == 5 is true). === compares value and type, which avoids surprises.',
    fix: 'if (a === b) { ... }',
  },
  {
    langs: ['js', 'java'], severity: 'bug',
    test: (l) => /<=\s*\w+\.length\b/.test(l),
    apply: (l) => ({ line: l.replace(/<=(\s*\w+\.length\b)/, '<$1') }),
    id: 'js-loop-le-length',
    topic: 'Loop boundaries',
    title: 'The loop goes one step too far',
    explanation: 'An array with 5 items has positions 0 to 4, but <= length also visits position 5, which does not exist. Use < instead.',
    fix: 'for (let i = 0; i < items.length; i++) { ... }',
  },
  {
    langs: ['js', 'java', 'c'], severity: 'bug',
    test: (l) => /\b(if|while)\s*\(/.test(l) && !l.includes('((') && /\b(if|while)\s*\([^=<>!)]*[^=<>!)\s]\s*=(?!=)/.test(l),
    apply: (l, lang) => ({ line: l.replace(/\b(if|while)(\s*\()([^=<>!)]*[^=<>!)\s])\s*=(?!=)\s*/, `$1$2$3 ${lang === 'js' ? '===' : '=='} `) }),
    id: 'c-assign-in-cond',
    topic: 'Assignment vs comparison',
    title: 'One "=" where you probably meant "=="',
    explanation: 'A single = stores a value. Inside an if, that changes your variable and is almost always true, so the condition does not check what you meant.',
    fix: 'if (x === 5) { ... }',
  },
  {
    langs: ['java'], severity: 'bug',
    test: (l) => /==\s*"[^"]*"|"[^"]*"\s*==/.test(l),
    apply: (l) => ({ line: l.replace(/(\w+)\s*==\s*("[^"]*")/, '$1.equals($2)').replace(/("[^"]*")\s*==\s*(\w+)/, '$1.equals($2)') }),
    id: 'java-str-eq',
    topic: 'Comparing values vs objects',
    title: 'Compare strings with .equals(), not ==',
    explanation: 'In Java, == checks whether two variables point at the same object, not whether the text matches. It can be false even when the words are identical.',
    fix: 'if (name.equals("Ada")) { ... }',
  },
  {
    langs: ['python', 'js'], severity: 'security',
    test: (l) => /\b(eval|exec)\s*\(/.test(l),
    id: 'eval-exec',
    topic: 'Safe handling of user input',
    title: 'eval/exec runs text as code',
    explanation: 'If any part of that text comes from a user, they can run their own commands on your computer or server. Look for a safer way to do the same job.',
    fix: '# Parse the data instead, e.g. int(text) or json.loads(text)',
  },
  {
    langs: ['*'], severity: 'security',
    test: (l) => /(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"']{4,}["']/i.test(l),
    id: 'secret',
    topic: 'Keeping secrets out of code',
    title: 'A secret is written directly in the code',
    explanation: 'Anyone who sees the code (or your GitHub repo) can see the secret. Keep passwords and keys in environment variables or a secrets manager.',
    fix: 'import os\npassword = os.environ["DB_PASSWORD"]',
  },
  {
    langs: ['*'], severity: 'security',
    test: (l) => /\b(select|insert|update|delete)\b[^\n]*(["']\s*\+|\+\s*["']|\$\{|\.format\(|\bf["'])/i.test(l),
    id: 'sql-concat',
    topic: 'Safe handling of user input',
    title: 'Building a database query by gluing text together (SQL injection)',
    explanation: 'If a user types something like \' OR \'1\'=\'1 into that variable, they change what your query does and can read or delete data. Use placeholders so the database treats the input as data only.',
    fix: 'db.query("SELECT * FROM users WHERE name = ?", [name], callback);',
  },
  {
    langs: ['js'], severity: 'security',
    test: (l) => /\.innerHTML\s*=/.test(l),
    apply: (l) => ({ line: l.replace(/\.innerHTML(\s*=)/, '.textContent$1') }),
    id: 'innerhtml',
    topic: 'Safe handling of user input',
    title: 'innerHTML can run a visitor\'s code',
    explanation: 'If the text contains a <script> or other HTML from a user, the browser will run it (cross-site scripting). Use textContent for plain text.',
    fix: 'element.textContent = message;',
  },
  {
    langs: ['c'], severity: 'security',
    test: (l) => /\bgets\s*\(/.test(l),
    apply: (l) => ({ line: l.replace(/\bgets\s*\(\s*(\w+)\s*\)/, 'fgets($1, sizeof($1), stdin)') }),
    id: 'c-gets',
    topic: 'Safe handling of user input',
    title: 'gets() cannot limit how much it reads',
    explanation: 'It happily writes past the end of your buffer (a buffer overflow), which is a classic security hole. It was removed from modern C.',
    fix: 'fgets(buffer, sizeof(buffer), stdin);',
  },
];

// Practice steps shown under "Where to improve", keyed by each rule's topic.
const TOPICS = {
  'Loop boundaries': [
    'Before running a loop, trace it by hand with a tiny list of 3 items and write down the value of i on every pass.',
    'Remember that n items sit at positions 0 to n-1. Stopping at length (not past it) is what keeps you in range.',
    'Where you can, loop over the items directly (for item in items) so there is no index to get wrong.',
  ],
  'Shared default values (mutability)': [
    'Learn the difference between mutable values (lists, dicts) and immutable ones (numbers, strings, tuples).',
    'Use None as the default and create the list inside the function.',
    'Test by calling the function twice in a row and checking that the second call starts fresh.',
  ],
  'Assignment vs comparison': [
    'Say it aloud as you type: one = means "store", two == mean "is equal to".',
    'Turn on a linter in your editor (Ruff or Pylint for Python, ESLint for JavaScript). It flags this as you type.',
    'Phrase each condition as a question first, such as "is x equal to 5?", then write it.',
  ],
  'Handling errors precisely': [
    'Catch the specific error you expect (ValueError, KeyError, FileNotFoundError) and nothing broader.',
    'Print or log the error message so problems never disappear silently.',
    'Trigger the error on purpose once, to confirm your handler does what you meant.',
  ],
  'Readability and conventions': [
    'Skim your language\'s style guide once (PEP 8 for Python).',
    'Run a formatter and linter on save so small style points fix themselves.',
    'Read a few functions from a well-known open-source project to pick up its habits.',
  ],
  'Edge cases (empty or missing input)': [
    'For every function, ask: what if the input is empty, zero, missing or huge?',
    'Write one tiny test for each answer before moving on.',
    'Handle the empty case first, with an early return.',
  ],
  'Modern JavaScript habits': [
    'Use const by default and let only when a value must change. Avoid var.',
    'Use === so JavaScript never converts types behind your back.',
    'Add ESLint to your project. Its default rules flag both.',
  ],
  'Comparing values vs objects': [
    'Learn the difference between two variables holding equal text and two names pointing at the same object.',
    'In Java compare Strings with .equals(). In Python, == compares values while "is" compares identity.',
    'Write a tiny test that compares two Strings built in different ways.',
  ],
  'Safe handling of user input': [
    'Treat anything a user types, or that arrives from a URL or form, as untrusted.',
    'Use parameterized queries, textContent, or a proper parser instead of building code or commands from text.',
    'Read the introduction to the OWASP Top 10, starting with Injection. It is short and beginner friendly.',
  ],
  'Keeping secrets out of code': [
    'Put passwords and keys in environment variables or a secrets manager.',
    'Add your .env file to .gitignore before your first commit.',
    'If a secret was ever committed, treat it as leaked and replace it.',
  ],
};

function listLines(lines) {
  const u = [...new Set(lines)].sort((a, b) => a - b);
  if (u.length === 1) return `line ${u[0]}`;
  return `lines ${u.slice(0, -1).join(', ')} and ${u[u.length - 1]}`;
}

function detectLanguage(hint, code) {
  const h = (hint || '').toLowerCase();
  if (h.includes('python')) return 'python';
  if (h.includes('javascript') || h.includes('typescript')) return 'js';
  if (h === 'java') return 'java';
  if (h === 'c' || h.includes('c++')) return 'c';
  if (h && h !== 'auto-detect') return 'other';
  if (/^\s*def \w+\(|^\s*import \w+|\bprint\(/m.test(code)) return 'python';
  if (/\bconsole\.|\bconst \w+|=>|\bfunction\b|\blet \w+/.test(code)) return 'js';
  if (/System\.out|public static void main/.test(code)) return 'java';
  if (/#include|\bint main\s*\(/.test(code)) return 'c';
  return 'other';
}

export function rulesReview(code, language, explainIn = 'en') {
  const L = I18N[explainIn]; // undefined means English
  const lang = detectLanguage(language, code);
  const found = [];

  code.split('\n').forEach((text, idx) => {
    const t = text.trim();
    if (!t || t.startsWith('#') || t.startsWith('//')) return;
    for (const r of RULES) {
      if (!r.langs.includes('*') && !r.langs.includes(lang)) continue;
      if (r.test(text)) {
        found.push({ id: r.id, line: idx + 1, severity: r.severity, topic: r.topic, title: r.title, explanation: r.explanation, fix: r.fix });
      }
    }
  });

  found.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.line - b.line);
  const issues = found.slice(0, 6).map(({ id, topic, ...issue }) => {
    const tr = L && L.rules[id];
    return tr ? { ...issue, title: tr[0], explanation: tr[1] } : issue;
  });

  // Group findings by skill: the habits behind the individual mistakes.
  const byTopic = new Map();
  for (const f of found) {
    const t = byTopic.get(f.topic) || { topic: f.topic, lines: [], rank: 9 };
    t.lines.push(f.line);
    t.rank = Math.min(t.rank, SEVERITY_ORDER[f.severity]);
    byTopic.set(f.topic, t);
  }
  const weakPoints = [...byTopic.values()]
    .sort((a, b) => a.rank - b.rank || b.lines.length - a.lines.length)
    .slice(0, 3)
    .map((t) => {
      const tr = L && L.topics[t.topic];
      const lines = [...new Set(t.lines)].sort((a, b) => a - b);
      return {
        key: t.topic, // stable English name, so progress tracking works in every language
        topic: tr ? tr.name : t.topic,
        observation: L ? L.ui.obs(lines) : `This came up on ${listLines(t.lines)} of your code.`,
        steps: tr ? tr.steps : TOPICS[t.topic],
      };
    });

  const praise = [];
  if (/^\s*(def|function|class)\s|=>/m.test(code)) praise.push(L ? L.ui.praiseFunctions : 'You organised your code into functions, which makes it easier to read and reuse.');
  if (/^\s*(#|\/\/)/m.test(code)) praise.push(L ? L.ui.praiseComments : 'You added comments, which helps future-you understand the code.');
  if (!praise.length) praise.push(L ? L.ui.praiseShared : 'You shared your code for feedback. Asking for reviews is one of the fastest ways to improve.');

  const n = issues.length;
  const summary = n === 0
    ? (L ? L.ui.clean : 'My quick checks did not spot any common mistakes. Nice work! Still run and test your code, because these checks only catch well-known patterns.')
    : L ? (n === 1 ? L.ui.foundOne : L.ui.foundMany(n))
        : `I found ${n === 1 ? 'one thing' : n + ' things'} worth a look. Start with the first one. You can do this!`;

  // Corrected copy of the learner's code: apply each matching check's safe, mechanical fix.
  // Issues with no mechanical fix (SQL, secrets, eval) are left for the learner to change by hand.
  const fixed = [];
  code.split('\n').forEach((text) => {
    const cur = { before: [], line: text, after: [] };
    const t = text.trim();
    if (t && !t.startsWith('#') && !t.startsWith('//')) {
      for (const r of RULES) {
        if (!r.apply || (!r.langs.includes('*') && !r.langs.includes(lang)) || !r.test(text)) continue;
        const res = r.apply(cur.line, lang);
        if (!res) continue;
        if (res.before) cur.before.push(...res.before);
        if (res.line != null) cur.line = res.line;
        if (res.after) cur.after.push(...res.after);
      }
    }
    fixed.push(...cur.before, cur.line, ...cur.after);
  });
  const correctedCode = fixed.join('\n') === code ? '' : fixed.join('\n');

  return { summary, issues, weakPoints, praise, correctedCode };
}
