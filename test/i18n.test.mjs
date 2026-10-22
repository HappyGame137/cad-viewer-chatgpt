import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messages,resolveLanguage,translate,ViewerError,errorText} from '../web/i18n.mjs';

test('Chinese and English catalogs cover the same messages and interpolation values',()=>{
  assert.deepEqual(Object.keys(messages.zh).sort(),Object.keys(messages.en).sort());
  for(const key of Object.keys(messages.en)){
    const slots=text=>[...text.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
    assert.deepEqual(slots(messages.zh[key]),slots(messages.en[key]),key);
    assert.ok(messages.zh[key].length&&messages.en[key].length,key);
  }
});
test('saved language takes priority; Chinese browser variants and other languages fall back correctly',()=>{
  for(const language of ['zh-CN','zh-TW','zh-HK','zh'])assert.equal(resolveLanguage(null,language),'zh');
  for(const language of ['en-US','fr','de','ja',''])assert.equal(resolveLanguage(null,language),'en');
  assert.equal(resolveLanguage('en','zh-CN'),'en');assert.equal(resolveLanguage('zh','en-US'),'zh');
  assert.equal(resolveLanguage('invalid','zh-CN'),'zh');
});
test('measurement, units and errors can be retranslated without losing values or technical details',()=>{
  const values={distance:'20.00',unit:'mm',x:'0.00',y:'20.00',z:'0.00'};
  assert.match(translate('zh','measureResult',values),/^距离 ≈ 20\.00 mm/);
  assert.match(translate('en','measureResult',values),/^Distance ≈ 20\.00 mm/);
  const error=new ViewerError('fileTooLarge');
  assert.match(errorText('zh',error),/30 MB/);assert.equal(errorText('en',error),'The file exceeds 30 MB.');
  assert.equal(errorText('zh',new Error('Not a valid ASCII or binary STL.')),messages.zh.badStl);
  assert.equal(errorText('en','Not a valid ASCII or binary STL.'),messages.en.badStl);
  assert.equal(errorText('zh',new Error('STEP converter exited (7).')),'STEP 转换器已退出（7）。');
  assert.match(errorText('zh',new Error('ENOENT: sample.step')),/ENOENT: sample\.step/);
  assert.equal(errorText('en',''),'');
});
