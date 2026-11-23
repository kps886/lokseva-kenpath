import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssistance } from '../assist.mjs';

const phrase = {
  farm: 'हंगामातील पीक',
  wage: 'प्रत्यक्ष काम मिळालेले दिवस',
  salary: 'किती महिने नोकरी',
  trade: 'विक्री आणि खर्च',
  pension: 'निवृत्तिवेतन कोणत्या महिन्यांमध्ये'
};
const samples = [
  ['खासगी कंपनीत मासिक पगार', ['salary']],
  ['वडील कारखान्यात नोकरी करतात', ['salary']],
  ['घरचे शेतकरी', ['farm']],
  ['भातशेती करतात', ['farm']],
  ['दररोज बांधकाम मजुरी', ['wage']],
  ['शेतमजूर', ['wage']],
  ['गावात किराणा दुकान चालवतात', ['trade']],
  ['आठवडी बाजारात भाजीपाला विक्रेता', ['trade']],
  ['महिन्याची पेन्शन मिळते', ['pension']],
  ['कुटुंबाला निवृत्तीवेतन मिळते', ['pension']],
  ['रोजंदारी व पीक विक्री', ['farm','wage']],
  ['दरमहा वेतन आणि दुकान', ['salary','trade']],
  ['माहिती उपलब्ध नाही', []],
  ['अर्जदार स्थलांतरित आहेत', []],
  ['not specified', []],
  ['', []]
];
for (const [occupation, expected] of samples) {
  test('retrieval for ' + (occupation || '(empty)'), () => {
    const {items} = buildAssistance({occupation, stage:'field'});
    const recognized = Object.keys(phrase).filter(k => items.some(i => i.detail.includes(phrase[k])));
    assert.deepEqual(recognized.sort(), [...expected].sort());
    if (!expected.length) assert.ok(items.some(i => i.label === 'उत्पन्नाचा स्रोत स्पष्ट करा'));
  });
}
test('each stage retrieves distinct guidance and quotes its evidence', () => {
  const prompts = ['intake','field','decision'].map(stage => {
    const item = buildAssistance({stage, documents:[
      {id:'income', label:'उत्पन्न पुरावा', present:true, detail:'किराणा दुकान'}
    ]}).items.find(i => i.source.includes('“किराणा दुकान”'));
    assert.ok(item);
    return item.detail;
  });
  assert.equal(new Set(prompts).size, 3);
});
test('unavailable evidence is excluded and an unrecorded amount is never treated as zero', () => {
  const {items} = buildAssistance({stage:'field', declaredIncome:1000, fieldIncome:null, documents:[
    {id:'income', label:'पावती', present:false, detail:'मासिक वेतन'}
  ]});
  assert.ok(items.some(i => i.label === 'उत्पन्नाचा स्रोत स्पष्ट करा'));
  assert.ok(items.some(i => i.label === 'संचिकेत नसलेली कागदपत्रे'));
  assert.ok(!items.some(i => i.label === 'रकमांमध्ये फरक'));
});
test('zero, difference and equality are distinguished', () => {
  for (const [fieldIncome, expected] of [[0,'रकमांमध्ये फरक'],[300,'दोन्ही रकमा जुळतात']]) {
    assert.ok(buildAssistance({stage:'decision', declaredIncome:300, fieldIncome}).items.some(i => i.label === expected));
  }
});
