// Keep the decision visible; explanations remain available without filling the sidebar.
export function renderProposal(box,result,{stageLabel='',describe=()=>''}={}){
 const doc=box.ownerDocument,make=(tag,text,className)=>{const el=doc.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;};
 const details=(label,className)=>{const el=make('details','',className);el.append(make('summary',label));return el;};
 const operations=result.plan.operations,coverage=result.coverage||[],pending=coverage.filter(c=>['pending','partial'].includes(c.status)),statuses={planned:'Proposto',partial:'Parcial',pending:'Pendente',not_needed:'Não se aplica'};
 box.replaceChildren();box.hidden=false;
 const heading=make('div','','proposal-heading');heading.append(make('strong',stageLabel||(operations.length?'Revisar edição':'Sem alterações')),make('span',`${operations.length} ${operations.length===1?'alteração':'alterações'}`));box.append(heading);
 function coverageList(items,parent){const list=make('ul','','proposal-coverage');list.setAttribute('aria-label','Partes do pedido');for(const item of items){const li=make('li','','coverage-'+item.status);li.append(make('span',statuses[item.status]||item.status,'coverage-status'),make('span',item.request));if(item.reason){const reason=details('Por quê?','coverage-reason');reason.append(make('p',item.reason));li.append(reason);}list.append(li);}parent.append(list);}
 if(pending.length)coverageList(pending,box);
 const fromCoverage=new Set(coverage.map(c=>`${c.request}: ${c.reason}`)),extra=[...new Set(result.pendingRequests||[])].filter(text=>!fromCoverage.has(text));
 if(extra.length){const missing=details(`Pendências adicionais (${extra.length})`,'proposal-pending');for(const text of extra)missing.append(make('p',text));box.append(missing);}
 const warnings=[...(result.plan.questions||[]),...(result.plan.unsupported||[]),...(result.analysisWarnings||[])];if(warnings.length){const warning=details(`Atenção (${warnings.length})`,'proposal-warnings');if(!operations.length)warning.open=true;for(const text of warnings)warning.append(make('p',text));box.append(warning);}
 const reviewDetails=details('Detalhes','proposal-details');
 if(result.plan.summary){const summary=make('p',result.plan.summary,'proposal-summary');if(operations.length)reviewDetails.append(summary);else box.append(summary);}
 const planned=coverage.filter(c=>!pending.includes(c));if(planned.length){const covered=details(`Pedido (${planned.length})`,'proposal-covered');coverageList(planned,covered);reviewDetails.append(covered);}
 const operationDetails=details(`Operações (${operations.length})`,'proposal-operations');for(const op of operations)operationDetails.append(make('p',describe(op)));reviewDetails.append(operationDetails);
 const shared=result.shared||{},evidence=details('Análise','proposal-evidence');evidence.append(make('p',shared.frames||shared.transcriptWords?`${shared.transcriptWords||0} palavras · ${shared.frames||0} ${shared.frames===1?'quadro':'quadros'}. Confira os cortes na timeline.`:'Pedido resolvido sem analisar áudio ou imagem.'));reviewDetails.append(evidence);box.append(reviewDetails);
 const actions=make('div','','proposal-actions');box.append(actions);return actions;
}
