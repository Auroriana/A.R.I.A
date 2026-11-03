export const expressions={neutral_attention:'Attentive',amused_interest:'Teasing',surprised_delight:'Surprised',restrained_concern:'Listening',focused_analysis:'Thinking',anger:'Angry'};
export const expressionOf=id=>Object.hasOwn(expressions,id)?id:'neutral_attention';
export function setExpression(id){const face=document.getElementById('capri-face');id=expressionOf(id);face.dataset.expression=id;face.setAttribute('aria-label','Capri · '+expressions[id]);face.dispatchEvent(new CustomEvent('capri-expression',{bubbles:true,detail:{expression:id}}));}
