/* Run: node scripts/check-experiences.cjs. No app password or external services required. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'chavrusa-experiences-'));
try {
  for (const name of ['experiences', 'config']) {
    const source = fs.readFileSync(path.join(root, 'lib', `${name}.ts`), 'utf8');
    fs.writeFileSync(path.join(temp, `${name}.js`), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText);
  }
  const { EXPERIENCES, isExperience } = require(path.join(temp, 'experiences'));
  const { LOOKS, normalizeLook, DEFAULT_SETTINGS } = require(path.join(temp, 'config'));
  assert.equal(EXPERIENCES.length, 8);
  assert.equal(new Set(LOOKS.map(x => x.id)).size, LOOKS.length);
  assert.equal(DEFAULT_SETTINGS.theme, 'daf');
  for (const id of ['daf','shtender','techelet','midnight','stone','leather','vilna','ink','sharp']) {
    assert(LOOKS.some(x => x.id === id)); assert.equal(normalizeLook(id), id); assert.equal(isExperience(id), false);
  }
  for (const item of EXPERIENCES) { assert.equal(normalizeLook(item.id), item.id); assert.equal(isExperience(item.id), true); }
  assert.equal(normalizeLook('unknown'), 'daf');
  assert.equal(normalizeLook('dark'), 'shtender'); assert.equal(normalizeLook('light'), 'techelet');
  const css = fs.readFileSync(path.join(root,'app/experiences.css'),'utf8');
  // A new stylesheet must not accidentally restyle a legacy look or introduce a global selector.
  const rules = css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g);
  let checked = 0;
  for (const [, selectors] of rules) {
    if (selectors.trim().startsWith('@')) continue;
    for (const selector of selectors.trim().split(/,\s*(?=\[data-|\.mini)/)) {
      assert(/^(\[data-experience\]|\[data-look='(?:paper-ink|midnight-sefer|beis-medrash|sand-teal|editorial|guided-learning|living-page|study-workspace)'\]|\.mini\.)/.test(selector), `Unscoped experience rule: ${selector}`);
      checked++;
    }
  }

  const Module = require('node:module');
  const iconFile = path.join(temp, 'ExperienceIcon.js');
  const iconJs = ts.transpileModule(fs.readFileSync(path.join(root,'components','ExperienceIcon.tsx'),'utf8'), { compilerOptions: { module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020 } }).outputText.replace('require("react/jsx-runtime")', 'require(' + JSON.stringify(require.resolve('react/jsx-runtime')) + ')');
  fs.writeFileSync(iconFile,iconJs);
  const componentFile = path.join(root, 'components', 'ExperienceHome.tsx');
  const component = new Module(componentFile, module);
  component.filename = componentFile;
  component.paths = Module._nodeModulePaths(root);
  component._compile(ts.transpileModule(fs.readFileSync(componentFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText.replace('require("./ExperienceIcon")', 'require(' + JSON.stringify(iconFile) + ')'), componentFile);
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const noop = () => {};
  for (const item of EXPERIENCES) {
    const html = renderToStaticMarkup(React.createElement(component.exports.default, { look:item.id, cont:{ref:'Berakhot 2a',heRef:'ברכות ב׳ א',line:2}, onContinue:noop,onLibrary:noop,onRecent:noop,onThemes:noop,onSettings:noop,onTalk:noop,onGuide:noop,onFilm:noop,talkSupported:true,talkOn:false }));
    for (const text of ['Berakhot 2a','Library','Notebook','Look and fonts','Start voice session']) assert(html.includes(text), `${item.id}: missing ${text}`);
    assert.equal((html.match(/experience-tool-number/g) || []).length,4);
  }
  console.log(`PASS: 8 experiences, 9 legacy looks, normalization, unchanged default, ${checked} scoped CSS selectors, 8 server-rendered homes`);
} finally { fs.rmSync(temp, {recursive:true,force:true}); }
