import type { Artifact, ArtifactKind } from '../types';

const LANG_TO_FILENAME: Record<string, string> = {
  html: 'index.html',
  css: 'style.css',
  scss: 'style.scss',
  js: 'script.js',
  javascript: 'script.js',
  ts: 'index.ts',
  typescript: 'index.ts',
  tsx: 'component.tsx',
  jsx: 'component.jsx',
  python: 'main.py',
  py: 'main.py',
  svg: 'image.svg',
  markdown: 'document.md',
  md: 'document.md',
  json: 'data.json',
  yaml: 'config.yaml',
  yml: 'config.yml',
  sh: 'script.sh',
  bash: 'script.sh',
  rust: 'main.rs',
  go: 'main.go',
  java: 'Main.java',
  c: 'main.c',
  cpp: 'main.cpp',
  sql: 'query.sql',
};

function inferFilename(lang: string, content: string): string {
  const normalized = lang.toLowerCase();

  // Check for a class name in Java/TypeScript
  if (normalized === 'java') {
    const match = content.match(/public\s+class\s+(\w+)/);
    if (match) return `${match[1]}.java`;
  }
  if (normalized === 'tsx' || normalized === 'jsx') {
    const match = content.match(/(?:export\s+(?:default\s+)?(?:function|const|class))\s+(\w+)/);
    if (match) return `${match[1]}.${normalized}`;
  }

  return LANG_TO_FILENAME[normalized] ?? `file.${normalized}`;
}

function inferKind(lang: string): ArtifactKind {
  const l = lang.toLowerCase();
  if (l === 'html') return 'html';
  if (l === 'svg') return 'svg';
  if (l === 'markdown' || l === 'md') return 'markdown';
  return 'code';
}

const ARTIFACT_LANGS = new Set([
  'html', 'css', 'scss', 'js', 'javascript', 'ts', 'typescript',
  'tsx', 'jsx', 'python', 'py', 'svg', 'markdown', 'md',
  'json', 'yaml', 'yml', 'sh', 'bash', 'rust', 'go', 'java',
  'c', 'cpp', 'sql',
]);

export function parseArtifacts(content: string): Artifact[] {
  const artifacts: Artifact[] = [];
  // Match fenced code blocks with a language tag
  const regex = /```(\w+)\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const lang = match[1].toLowerCase();
    const code = match[2];
    if (!ARTIFACT_LANGS.has(lang) || code.trim().length === 0) continue;

    artifacts.push({
      id: crypto.randomUUID(),
      filename: inferFilename(lang, code),
      language: lang,
      kind: inferKind(lang),
      content: code,
      isExpanded: true,
    });
  }

  return artifacts;
}

export function stripArtifactBlocks(content: string): string {
  // Remove code blocks that were extracted as artifacts, keep inline text
  return content.replace(/```\w+\n[\s\S]*?```/g, (match) => {
    const lang = match.match(/```(\w+)/)?.[1]?.toLowerCase() ?? '';
    if (ARTIFACT_LANGS.has(lang)) return '';
    return match;
  }).replace(/\n{3,}/g, '\n\n').trim();
}
