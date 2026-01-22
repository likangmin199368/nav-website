/**
 * 书签解析器单元测试
 * 运行: node scripts/bookmark-parser.test.mjs
 */
import { parseBookmarkHtml, flattenParsedData, sanitizeString, sanitizeUrl } from '../functions/lib/bookmark-parser.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ ${message}`);
    passed++;
  } else {
    console.log(`❌ ${message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log(`✅ ${message}`);
    passed++;
  } else {
    console.log(`❌ ${message}: expected "${expected}", got "${actual}"`);
    failed++;
  }
}

console.log('=== 书签解析器单元测试 ===\n');

// 测试 sanitizeString
console.log('--- sanitizeString 测试 ---');
assertEqual(sanitizeString('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;&#x2F;script&gt;', 'XSS 脚本清理');
assertEqual(sanitizeString('  hello world  '), 'hello world', '去除首尾空格');
assertEqual(sanitizeString(null), '', '处理 null');
assertEqual(sanitizeString(''), '', '处理空字符串');

// 测试 sanitizeUrl
console.log('\n--- sanitizeUrl 测试 ---');
assertEqual(sanitizeUrl('https://example.com'), 'https://example.com', 'HTTPS URL');
assertEqual(sanitizeUrl('http://example.com'), 'http://example.com', 'HTTP URL');
assertEqual(sanitizeUrl('javascript:alert(1)'), '', '拒绝 javascript: URL');
assertEqual(sanitizeUrl('ftp://example.com'), '', '拒绝非 HTTP 协议');
assertEqual(sanitizeUrl(''), '', '处理空字符串');

// 测试解析 fixture 文件
console.log('\n--- 解析 fixture 文件测试 ---');
const fixtureHtml = readFileSync(join(__dirname, 'bookmarks-fixture.html'), 'utf-8');
const { menus, errors } = parseBookmarkHtml(fixtureHtml);

assert(menus.length > 0, '解析出至少一个书签');
assert(errors.length > 0, '解析错误已记录');

const github = menus.find(m => m.url === 'https://github.com/');
assert(github !== undefined, '找到 GitHub 书签');

// 测试 flattenParsedData
console.log('\n--- flattenParsedData 测试 ---');
const { menuList, subMenuList, cardList } = flattenParsedData(menus);

assert(menuList.length > 0, '扁平化后有菜单');
assert(cardList.length > 0, '扁平化后有卡片');
assertEqual(subMenuList.length, 0, '扭平化后没有子菜单');
assert(cardList.every(c => c._menuTempId), '所有卡片都有 _menuTempId');

// 验证卡片结构
const sampleCard = cardList[0];
assert(sampleCard.title !== undefined, '卡片有 title');
assert(sampleCard.url !== undefined, '卡片有 url');
assert(sampleCard.order !== undefined, '卡片有 order');

console.log('\n=== 测试结果 ===');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
