// A small, local nearest-neighbour retrieval model. Training examples are
// authored synthetic phrases. It retrieves verification prompts, never decisions.
const guidanceExamples = [
  {
    kind: 'farm',
    examples: ['शेती हे उत्पन्नाचे साधन आहे', 'शेतकरी कुटुंब जमीन कसते', 'पीक विक्रीची रक्कम', 'दूध विक्री व दुग्ध व्यवसाय', 'भातशेती', 'पिकाच्या विक्रीची पावती', 'शेती उत्पन्न', 'दुग्धव्यवसाय'],
    intake: 'शेती किंवा दुग्धव्यवसायाशी संबंधित उत्पन्नाचा कालावधी पुराव्यात नमूद आहे का ते पाहा.',
    field: 'कोणत्या हंगामातील पीक किंवा दूध विक्री या रकमेत समाविष्ट आहे, हे विचारून नोंद करा.',
    decision: 'हंगामी उत्पन्न कोणत्या कालावधीसाठी मोजले आहे, हे पडताळणी नोंदीत पाहा.'
  },
  {
    kind: 'wage',
    examples: ['रोजंदारीवर काम', 'हंगामी मजुरी', 'बांधकाम मजूर', 'शेतमजुरीची नोंद', 'दिवसाची मजुरी मिळते', 'मोलमजुरी', 'बांधकामावर रोजंदारी', 'घरकाम करून मिळकत'],
    intake: 'मजुरीची नोंद दैनिक, मासिक की वार्षिक आहे ते तपासा.',
    field: 'दिवसाचा दर आणि प्रत्यक्ष काम मिळालेले दिवस किती, हे स्वतंत्रपणे नोंदवा.',
    decision: 'मजुरीची वार्षिक रक्कम काढताना धरलेले कामाचे दिवस पडताळणी नोंदीत आहेत का ते पाहा.'
  },
  {
    kind: 'salary',
    examples: ['खासगी नोकरीचा पगार', 'मासिक वेतन', 'वेतनधारक कर्मचारी', 'कंपनीची वेतनपावती', 'पगाराची पावती', 'नियमित पगारदार', 'कार्यालयीन कर्मचारी', 'कारखान्यात नोकरी'],
    intake: 'वेतनपावतीवरील महिना आणि अर्जातील वार्षिक उत्पन्नाचा कालावधी तपासा.',
    field: 'मासिक वेतन किती आणि त्या कालावधीत किती महिने नोकरी होती, हे विचारून नोंद करा.',
    decision: 'वेतनाचा कालावधी आणि पडताळलेली वार्षिक रक्कम यांचा मेळ नोंदीत पाहा.'
  },
  {
    kind: 'trade',
    examples: ['किराणा दुकान', 'स्वयंरोजगार शिवणकाम', 'लघु व्यवसाय', 'भाजीपाला विक्रेता', 'फेरीवाला', 'दुकानदार', 'व्यवसायातील नफा', 'फळ विक्रेता', 'शिलाईचे काम'],
    intake: 'व्यवसायाच्या पुराव्यात दिलेली रक्कम विक्रीची आहे की खर्चानंतरची मिळकत, ते ओळखा.',
    field: 'विक्री आणि खर्च स्वतंत्रपणे विचारून वार्षिक उत्पन्न कसे मोजले ते नोंदवा.',
    decision: 'दुकानाची उलाढाल आणि अर्जातील उत्पन्न यांतील फरक पडताळणी नोंदीत स्पष्ट आहे का ते पाहा.'
  },
  {
    kind: 'pension',
    examples: ['निवृत्तिवेतन मिळते', 'मासिक पेन्शन', 'कुटुंब निवृत्तीवेतन', 'पेन्शनधारक', 'निवृत्त कर्मचाऱ्याचे पेन्शन', 'पेंशन रक्कम', 'निवृत्ती वेतनाची नोंद'],
    intake: 'निवृत्तिवेतनाच्या नोंदीत रक्कम आणि कालावधी दोन्ही दिसतात का ते पाहा.',
    field: 'निवृत्तिवेतन कोणत्या महिन्यांमध्ये मिळाले, हे नोंदीशी जुळवा.',
    decision: 'निवृत्तिवेतनाची वार्षिक बेरीज कोणत्या नोंदीवरून घेतली आहे ते तपासा.'
  }
];

const retrievalStopwords = new Set(['मिळते', 'मिळतो', 'आहे', 'आहेत', 'आणि', 'व', 'करून', 'हे', 'किती', 'नोंद', 'रक्कम']);

function retrieveFeatures(text) {
  const words = String(text || '').normalize('NFC').toLowerCase()
    .match(/[\p{L}\p{M}]+/gu) || [];
  const features = new Set();
  for (const word of words) {
    if (retrievalStopwords.has(word)) continue;
    features.add('w:' + word);
    const padded = '^' + word + '$';
    for (let i = 0; i <= padded.length - 3; i++) features.add(padded.slice(i, i + 3));
  }
  return features;
}

const retrievalRows = guidanceExamples.flatMap(group =>
  group.examples.map(example => ({group, features: retrieveFeatures(example)})));
const featureFrequency = new Map();
for (const row of retrievalRows) {
  for (const feature of row.features) {
    featureFrequency.set(feature, (featureFrequency.get(feature) || 0) + 1);
  }
}
function retrievalWeight(feature) {
  return 1 + Math.log((1 + retrievalRows.length) / (1 + (featureFrequency.get(feature) || 0)));
}
function weightedNorm(features) {
  return Math.sqrt([...features].reduce((n, f) => n + retrievalWeight(f) ** 2, 0));
}
for (const row of retrievalRows) row.norm = weightedNorm(row.features);

function retrieveGuidance(records) {
  const matches = new Map();
  for (const record of records) {
    const features = retrieveFeatures(record.text);
    const norm = weightedNorm(features);
    if (!norm) continue;
    for (const row of retrievalRows) {
      let dot = 0;
      for (const f of row.features) if (features.has(f)) dot += retrievalWeight(f) ** 2;
      const score = dot / (norm * row.norm);
      if (score < 0.22 || score <= (matches.get(row.group.kind)?.score || 0)) continue;
      matches.set(row.group.kind, {score, record, group: row.group});
    }
  }
  const ranked = [...matches.values()].sort((a,b) => b.score - a.score);
  return ranked.filter(m => m.score >= ranked[0].score * 0.7).slice(0, 2);
}

const moneyFormat = new Intl.NumberFormat('mr-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0
});
const guidanceStage = {
  intake: ['कागदपत्र तपासणी', 'उत्पन्नाच्या पुराव्यासाठी तपासणीचा मुद्दा'],
  field: ['प्रत्यक्ष पडताळणी', 'पडताळणीवेळी विचारायचा प्रश्न'],
  decision: ['निर्णयापूर्वीचा आढावा', 'अंतिम तपासणीचा मुद्दा']
};

export function buildAssistance(application) {
  const stage = Object.hasOwn(guidanceStage, application.stage) ? application.stage : 'intake';
  const [title, promptLabel] = guidanceStage[stage];
  const docs = application.documents || [];
  const evidence = [{source: 'अर्जातील व्यवसाय', text: application.occupation},
    ...docs.filter(d => d.present && d.id === 'income').map(d =>
      ({source: d.label, text: d.detail})),
    {source: 'पडताळणी नोंद', text: application.fieldNote}];
  const matches = retrieveGuidance(evidence);
  const items = [];
  const missing = docs.filter(d => !d.present);
  if (missing.length) {
    items.push({label: 'संचिकेत नसलेली कागदपत्रे', detail: missing.map(d => d.label).join(' · '),
      source: 'अर्जाची कागदपत्र सूची'});
  }
  if (stage === 'intake') {
    const unchecked = docs.filter(d => d.present && !d.verified);
    if (unchecked.length) items.push({label: 'पाहणी बाकी', detail: unchecked.map(d => d.label).join(' · '),
      source: 'कागदपत्र तपासणीची स्थिती'});
  }
  if (Number.isFinite(application.fieldIncome) && Number.isFinite(application.declaredIncome)) {
    const field = moneyFormat.format(application.fieldIncome);
    const declared = moneyFormat.format(application.declaredIncome);
    const diff = Math.abs(application.fieldIncome - application.declaredIncome);
    items.push({label: diff ? 'रकमांमध्ये फरक' : 'दोन्ही रकमा जुळतात',
      detail: 'अर्जातील ' + declared + ' आणि पडताळणीतील ' + field +
        (diff ? ' यांत ' + moneyFormat.format(diff) + ' फरक आहे. दोन्ही रकमांचा कालावधी तपासा.' : ' या रकमा समान आहेत.'),
      source: 'घोषित वार्षिक उत्पन्न व पडताळलेले उत्पन्न'});
  } else if (stage !== 'intake') {
    items.push({label: 'पडताळलेली रक्कम', detail:'घोषित वार्षिक उत्पन्नाशी तुलना करण्यासाठी प्रत्यक्ष पडताळणीतील रक्कम नोंदवा.',
      source:'पडताळणीतील वार्षिक उत्पन्न अद्याप नोंदलेले नाही'});
  }
  for (const {group,record} of matches) {
    items.push({label: promptLabel, detail: group[stage], source: record.source + ' · “' + record.text + '”'});
  }
  if (!matches.length) items.push({label: 'उत्पन्नाचा स्रोत स्पष्ट करा',
    detail:'नोंदींमधून उत्पन्नाचा प्रकार खात्रीने ओळखता आला नाही. अर्जदाराने दिलेला स्रोत व कालावधी तपासा.',
    source:'अर्जातील व्यवसाय व उपलब्ध उत्पन्न नोंदी'});
  if (stage === 'decision' && application.fieldNote) items.push({label:'पडताळणी नोंदीतील मूळ मजकूर',
    detail:application.fieldNote, source:'प्रत्यक्ष पडताळणी'});
  return {
    title, summary: 'नोंदवलेल्या माहितीवरून सुचवलेले तपासणीचे मुद्दे. प्रत्येक मुद्दा मूळ नोंदीशी पडताळा.',
    items, method:'स्थानिक मजकूर-साम्य मॉडेल व नोंदींची तुलना'
  };
}
