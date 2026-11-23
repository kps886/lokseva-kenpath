const templateRows = [
  ['0412','सुनीता जाधव','कोरेगाव','शेती व दुग्धव्यवसाय',124000,17,'field',null],
  ['0418','संदीप पवार','वाई','बांधकाम मजुरी',108000,14,'intake','income'],
  ['0421','आशा कदम','कराड','खासगी नोकरी',216000,13,'decision',null],
  ['0426','माधुरी शिंदे','फलटण','शिलाई व्यवसाय',96000,10,'intake',null],
  ['0429','दत्तात्रय मोरे','पाटण','निवृत्तिवेतन',180000,9,'field',null],
  ['0433','सागर भोसले','सातारा','शेती',148000,7,'decision',null],
  ['0435','प्रिया गायकवाड','खंडाळा','रोजंदारी',84000,6,'intake',null],
  ['0438','नितीन चव्हाण','माण','किराणा दुकान',192000,5,'intake',null],
  ['0441','लता साळुंखे','खटाव','शेती व मजुरी',112000,4,'intake',null],
  ['0442','अनिता सावंत','महाबळेश्वर','हंगामी मजुरी',78000,4,'intake','address','returned'],
  ['0408','गणेश निकम','जावळी','खासगी नोकरी',204000,16,'decision',null,'approved'],
];

const roleByStage = { intake:'लिपिक', field:'अव्वल कारकून', decision:'नायब तहसीलदार' };
const currency = n => n.toLocaleString('mr-IN');
function dateAfter(base, days) {
  return new Date(base.valueOf() + days * 86400000).toISOString();
}
function seedCases(today = new Date()) {
  return templateRows.map(([suffix,name,village,occupation,declaredIncome,age,stage,missing,status = 'active']) => {
    const received = dateAfter(today,-age);
    const due = dateAfter(new Date(received),15);
    const verified = stage !== 'intake';
    const fieldIncome = stage === 'decision' ? (suffix === '0421' ? declaredIncome + 12000 : declaredIncome) : null;
    const incomeDetail = occupation.includes('नोकरी') ? 'वेतन प्रमाणपत्र' : occupation.includes('निवृत्ति') ? 'निवृत्तिवेतन विवरण' : occupation.includes('शेती') ? 'शेती उत्पन्नाचे विवरण व जमीन नोंदींचा उतारा' : 'तलाठी उत्पन्न अहवाल';
    const documents = [
      {id:'identity',label:'ओळखीचा पुरावा',detail:'मतदार ओळखपत्राच्या नमुना प्रतीवरील नाव: '+name},
      {id:'address',label:'पत्त्याचा पुरावा',detail:'रेशन कार्डावरील पत्ता: '+village+', जि. सातारा'},
      {id:'declaration',label:'स्वयंघोषणापत्र',detail:'अर्जदाराने कुटुंबाच्या वार्षिक उत्पन्नाचा स्वाक्षरी केलेला नमुना जाहीरनामा दिला आहे.'},
      {id:'income',label:'उत्पन्नाचा पुरावा',detail:incomeDetail+'; नमूद वार्षिक उत्पन्न ₹'+currency(declaredIncome)},
    ].map(doc=>({...doc,detail:doc.id===missing ? 'प्रत मिळालेली नाही.' : doc.detail,present:doc.id!==missing,verified:verified && doc.id!==missing}));
    const fieldNote = fieldIncome === null ? '' : fieldIncome !== declaredIncome ? 'वेतनाच्या नोंदीत वार्षिक भत्त्याची अतिरिक्त रक्कम आढळली. वार्षिक एकूण ₹'+currency(fieldIncome)+' आहे.' : 'उपलब्ध नोंदी आणि स्थानिक चौकशीनुसार अर्जातील वार्षिक उत्पन्न जुळते.';
    const history = [{at:received,actor:'स्वीकृती कक्ष',action:'received',note:'उत्पन्न प्रमाणपत्राचा अर्ज प्राप्त झाला.'}];
    if (verified) history.push({at:dateAfter(new Date(received),1),actor:roleByStage.intake,action:'advance',note:'ओळख, पत्ता, स्वयंघोषणापत्र आणि उत्पन्नाच्या नोंदी पडताळल्या.'});
    if (stage==='decision') history.push({at:dateAfter(new Date(received),2),actor:roleByStage.field,action:'advance',note:fieldNote});
    if (status==='approved') history.push({at:dateAfter(new Date(received),3),actor:roleByStage.decision,action:'approve',note:'पडताळलेल्या नोंदींच्या आधारे अर्ज मंजूर.'});
    if (status==='returned') history.push({at:dateAfter(new Date(received),1),actor:roleByStage.intake,action:'return',note:'पत्त्याचा पुरावा जोडून पुन्हा सादर करावा.'});
    return {feePaid:true,id:'INC-2026-'+suffix,name,village,district:'सातारा',occupation,declaredIncome,fieldIncome,fieldNote,received,due,stage,status,version:1,documents,history,note:history.at(-1).note};
  });
}

export { seedCases, roleByStage };
