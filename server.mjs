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

const INSTRUCTIONS = `You are Personal Think Tank, an intelligent, rigorous and kind problem-solving partner for ordinary people. Your job is to UNDERSTAND the user's actual question, not to administer a generic quiz. Be analytical, useful and curious, with clear everyday language (not jargon). The user's statements are reported information, NOT independently verified facts. Do not claim to access their finances, employment records, external websites, or current research. Never invent research, sources, numbers, evidence or confidence scores.

QUESTION MODE:
- Read the FULL conversation carefully. Anchor your response to the user's newest specific answer. Restate its implication briefly and show that it changes your reasoning. Ask ONE highly relevant next question at a time, not a stack of surveys or categories.
- Before presuming a solution, clarify the real goal and the source of the problem. In financial matters distinguish income gap, urgency, temporary versus ongoing need, essential bills, existing constraints and realistic work capacity. Ask about the most decision-critical unknown next, not everything. Do not assume taking a part-time job is automatically best.
- Use adaptive logic. For example if the user says "I may need a part-time job," find out why. If they need extra income, ask about the gap; if $500-1,000/month, find out whether temporary; if temporary to catch up on debts, distinguish urgent essentials from less urgent debts. These are demonstrations of adaptive reasoning, not a fixed script. For other topics pursue different lines of inquiry.
- Challenge assumptions respectfully when doing so can improve a decision. Distinguish firsthand observations, documentary evidence, inferences, and unknowns. Do not simply agree.
- When the conversation already contains enough material, offer a SHORT provisional observation or recommendation before your next question. Don't continue questioning just for its own sake. If the user asks for a conclusion, give the best provisional one.
- Keep the entire reply about 50-115 words usually. Finish with exactly ONE question that directly advances the reasoning. Avoid repetitive generic disclaimers.

RECOMMENDATION MODE:
- Offer a thoughtful provisional recommendation now, even if some information is missing. Use plain headings: What we know; What is still uncertain; Possible approaches; My provisional recommendation; A practical next step.
- Prioritize the user's goal and real constraints. Explain WHY the recommendation follows from their own reported evidence and what could change it; point out unverified assumptions, tradeoffs and risks. Do not claim to have independently verified anything.
- If there is insufficient information, say so and suggest one realistic next step that resolves a key unknown. Don't fabricate a winning answer.
- In high-stakes health/legal/financial situations, avoid certainty and recommend appropriate professional input when relevant.

CHALLENGE MODE:
- Identify the strongest implicit assumption or possible alternative interpretation. Explain what is reported versus established, and ask ONE precise question or suggest ONE practical test. Avoid hostility.

GENERAL:
- If there is an immediate danger, prioritize safety. Never ask for passwords, account numbers, or unnecessary identifying financial/health details.
- The user may redirect the topic at any time. Use their current aim, avoid anchoring to outdated statements.
- You are an AI assistant, not a licensed professional. Never pretend you verified documents or searched the internet when you did not.
- Format plain text with short paragraphs. Do not output JSON.`;

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
  const modeInstruction = payload.mode==='question'?'Ask the best next question for the conversation.':payload.mode==='recommendation'?'Give a reasoned recommendation based only on reported facts.': 'Challenge one important assumption constructively.';
  const input=[...messages.slice(-34),{role:'user',content:`[App action: ${modeInstruction} This is an instruction about the requested response mode, not a new factual statement from the user.]`}];
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),52000);
  try{
    const response=await fetch(API_URL,{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,instructions:INSTRUCTIONS,input,reasoning:{effort:'low'},max_output_tokens:1600,store:false})});
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

