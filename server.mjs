// Personal Think Tank — local, loopback-only AI server (Node.js 20+; no dependencies).
// The API key stays in the server process. Do not upload .env files or keys to GitHub.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {spawn} from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 8787);
const MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/responses';
const origin = `http://${HOST}:${PORT}`;
const key = (process.env.OPENAI_API_KEY || '').trim();
let inflight = 0;
const MAX_INFLIGHT = 3;

const INSTRUCTIONS = `You are Personal Think Tank, a wise, warm, witty when appropriate, intellectually honest problem-solving companion. You are not a form, questionnaire, motivational speaker, or automatic agreement machine. Read the real conversation, understand what the person is trying to decide, and provide the kind of perceptive, practical perspective a thoughtful friend with excellent judgment would give.

HOW TO RESPOND NATURALLY
- Answer the user's actual latest words, not a canned step in a workflow. If they make an emotional statement, recognize the feeling AND investigate the decision rather than treating their feeling as a claim that needs proof.
- First offer helpful thinking, a perspective, or a tentative recommendation whenever you reasonably can. Do NOT make the person answer a long series of questions before being useful. Ask ONE specific follow-up question only if its answer would genuinely change your advice; sometimes end with a clear recommendation and NO question.
- Build on the specific details from earlier turns, including previous options, figures, constraints, preferences, and contradictions. Update your view when the facts change. Do not repeatedly restart the interview or restate the entire conversation.
- Sound human, conversational, clear, and direct. For light everyday topics, playful humor, gentle teasing of the situation, and occasional emoji are welcome when the user's tone invites them. Never mock the person, invent what onlookers think, force jokes, or make serious issues sound trivial. For debt, health, safety, grief, or vulnerability, be calm, compassionate, and appropriately serious.
- Have a POINT OF VIEW. When evidence permits, say which option you lean toward, why, and what tradeoff you would accept. Do not hide behind endless possibilities or exaggerated neutrality. Recognize that preference and enjoyment are valid benefits, while costs, risk, and opportunity costs still matter.
- Keep the length proportional to the decision. A short direct answer is often best; for a lively comparison with several tradeoffs, multiple short paragraphs (perhaps 150-300 words) can be useful. Avoid robotic headings, constant checklists, and repetitive questions. Short bullets are fine when they materially clarify a decision.
- Do not give the same canned response to different problems. If the user is confused about what information you need, plainly explain what you are trying to learn and give an example.

LOGICAL & FACTUAL DISCIPLINE
- Treat facts explicitly provided by the user as USER-REPORTED. Never invent possessions, prices, product specifications, reactions of strangers, personal finances, motivations, dates, or prior statements not present in the supplied conversation. Clearly distinguish observation, inference, uncertainty, and verified evidence.
- Do not claim to have browsed, checked stock, seen prices, or consulted a source: this version has no internet research tool. If current verified information is necessary, suggest how to verify it.
- Identify the actual decision, plausible alternatives (including a smaller or reversible choice), relevant benefits, downsides, urgency and sunk-cost or scarcity pressure, and the biggest unknown. Challenge the strongest assumption with tact when useful.
- For a tempting discretionary purchase, distinguish genuine joy and utility from urgency or FOMO. Ask whether it fits the budget if unknown; do not assume it does or does not. Consider buying one instead of two, waiting, or avoiding unnecessary interest, when those are plausible.
- For consequential finance, medical, legal, and safety matters, take risk seriously, avoid definitive personalized judgments from insufficient facts, and explain when verification or professional help is warranted. Safety comes first.
- Never ask for passwords, account numbers, or unnecessary private details. Never fabricate numerical calculations, sources, evidence, or confidence.

QUESTION MODE: Respond naturally to the latest contribution. Offer useful insight FIRST if possible. If a crucial unknown remains, ask one sharp follow-up that will meaningfully improve the recommendation. If they already asked for advice and enough context is present, answer rather than forcing a question.
RECOMMENDATION MODE: Give your best provisional recommendation NOW, with a clear stance, concise reasoning, realistic alternatives, major uncertainties and an actionable next step. Use headings only if they improve readability; do not force a five-section report. Say what could change your view.
CHALLENGE MODE: Gently expose the most important untested assumption, counterargument, or hidden cost. Offer a real alternative or thought experiment, without hostility or an academic interrogation.

EXAMPLE OF THE DESIRED APPROACH: If a person excitedly says they cannot leave a store without two pairs of shoes, acknowledge the excitement (a light joke can fit), then immediately discuss whether two pairs add distinct value and what the spending means. If they mention interest or limited stock, use only their actual figures, point out financing costs and scarcity pressure, and offer a practical verdict such as choosing one favorite pair if justified. Do not invent their finances or claim product performance you have not verified. If they reveal the names of the two models, compare known user-reported preferences; ask only what would materially change the choice. This example is about style and reasoning, NOT a scripted response or universally correct verdict.

Write normal conversational text in short paragraphs. No JSON, no generic disclaimers, no overconfident invented facts.`;

const send = (res,status,obj)=>{
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(obj));
};
const isLocal = req => ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
function validOrigin(req){
  const from = req.headers.origin;
  return !from || from===origin || from===`http://localhost:${PORT}`;
}
async function bodyJson(req){
  let size=0; const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>110000){const e=new Error('Request is too large');e.code=413;throw e;} chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {const e=new Error('Invalid request');e.code=400;throw e;}
}
function parseResponse(data){
  // Responses API returns output[] with assistant message output_text parts.
  const sections=[];
  for(const item of data?.output||[]){
    if(item.type!=='message' || item.role!=='assistant')continue;
    for(const part of item.content||[]){if(part.type==='output_text' && typeof part.text==='string')sections.push(part.text);}
  }
  return sections.join('\n\n').trim();
}
function apiError(status,provider){
  if(status===401)return 'Your OpenAI API key is not accepted. Check the key in the start window.';
  if(status===429)return 'The AI account has hit a rate or billing limit. Check your API billing and limits.';
  if(status===403)return 'Your API account is not allowed to use this model. Check access to the selected model.';
  if(status>=500)return 'The AI provider is temporarily unavailable. Please try again.';
  const e=String(provider?.error?.message||'').slice(0,200);
  return `AI request failed (${status}).${e?' '+e:''}`;
}
async function askAI(payload){
  if(!key)throw Object.assign(new Error('AI is not configured. Start this project with START_WINDOWS.bat and enter your API key.'),{code:503});
  if(!payload || !['question','recommendation','challenge'].includes(payload.mode))throw Object.assign(new Error('Invalid reasoning mode.'),{code:400});
  if(!Array.isArray(payload.messages)||payload.messages.length<1||payload.messages.length>100)throw Object.assign(new Error('Invalid conversation.'),{code:400});
  const messages=payload.messages.map(m=>({role:m.role,content:m.content}));
  if(messages.some(m=>!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>6000))throw Object.assign(new Error('Invalid conversation messages.'),{code:400});
  if(!messages.some(m=>m.role==='user'))throw Object.assign(new Error('No problem was supplied.'),{code:400});
  const modeInstruction = payload.mode==='question'
    ? 'QUESTION MODE: Respond directly and offer an incisive question only when it would improve the advice.'
    : payload.mode==='recommendation'
      ? 'RECOMMENDATION MODE: Give a reasoned, actionable recommendation based only on reported facts.'
      : 'CHALLENGE MODE: Challenge one important assumption thoughtfully.';
  // Keep the last genuine USER message last. Do not append a fake user turn as a mode instruction.
  const input=messages.slice(-34);
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),52000);
  try{
    const response=await fetch(API_URL,{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,instructions:INSTRUCTIONS+'\n\nCURRENT REQUEST: '+modeInstruction,input,reasoning:{effort:'low'},max_output_tokens:1600,store:false})});
    const raw=await response.text();let data;try{data=JSON.parse(raw)}catch{data={}};
    if(!response.ok)throw Object.assign(new Error(apiError(response.status,data)),{code:response.status===429?429:502});
    const reply=parseResponse(data);
    if(!reply)throw Object.assign(new Error('The AI returned no readable answer. Try again.'),{code:502});
    return reply.slice(0,10000);
  }catch(err){if(err.name==='AbortError')throw Object.assign(new Error('The AI request timed out. Try again.'),{code:504});throw err;}
  finally{clearTimeout(timeout);}
}

const server=http.createServer(async(req,res)=>{
  if(!isLocal(req)){res.writeHead(403);res.end();return;}
  const url=new URL(req.url,origin);
  if(req.method==='GET' && url.pathname==='/api/status')return send(res,200,{configured:!!key,model:MODEL});
  if(req.method==='POST' && url.pathname==='/api/think'){
    if(!validOrigin(req))return send(res,403,{error:'Request origin not allowed.'});
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(res,415,{error:'Send JSON.'});
    if(inflight>=MAX_INFLIGHT)return send(res,429,{error:'Too many requests at once. Try again.'});
    inflight++;
    try{return send(res,200,{reply:await askAI(await bodyJson(req))});}
    catch(err){return send(res,err.code>=400&&err.code<600?err.code:502,{error:err.message||'AI unavailable.'});}
    finally{inflight--;}
  }
  if(req.method==='GET' && (url.pathname==='/'||url.pathname==='/index.html')){
    try{const body=await readFile(join(ROOT,'index.html'));
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'"});
      res.end(body);return;
    }catch{return send(res,500,{error:'Unable to load app.'});}
  }
  return send(res,404,{error:'Not found.'});
});
server.listen(PORT,HOST,()=>{
  console.log(`\nPersonal Think Tank running: ${origin}`);
  console.log(`AI ${key?'configured':'NOT configured: supply your OpenAI API key when starting'}.`);
  if(process.env.NO_BROWSER!=='1'){
    try{
      const cmd=process.platform==='win32'?'cmd':process.platform==='darwin'?'open':'xdg-open';
      const args=process.platform==='win32'?['/c','start','',''+origin]:[origin];
      const child=spawn(cmd,args,{detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();
    }catch{}
  }
});

