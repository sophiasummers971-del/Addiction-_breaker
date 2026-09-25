import { createRemoteJWKSet, jwtVerify } from 'jose';
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const SESSION = '__Host-ab_session', STATE = '__Host-ab_oauth', LIMIT = 1024 * 1024;
const empty = () => ({version:1,entries:[],plan:''});
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
const cookie = (name,value,seconds) => `${name}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Lax`;
function cookies(req){return Object.fromEntries((req.headers.get('Cookie')||'').split(';').map(v=>v.trim().split('=')));}
function response(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Strict-Transport-Security':'max-age=31536000; includeSubDomains','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",...headers}});}
function redirect(path,c){return response(null,302,{Location:path,...(c?{'Set-Cookie':c}:{})});}
function origin(env){try{const u=new URL(env.APP_ORIGIN);return u.protocol==='https:'&&u.origin===env.APP_ORIGIN?u.origin:null;}catch{return null;}}
function configured(env){return !!(env.DB&&origin(env)&&env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET);}
async function authorizationURL(env,state,verifier,nonce){
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
 const challenge=btoa(String.fromCharCode(...digest)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');u.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:`${origin(env)}/api/auth/google/callback`,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:challenge,code_challenge_method:'S256'});return u;
}
async function verifyGoogle(env,code,verifier){
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,code_verifier:verifier,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:`${origin(env)}/api/auth/google/callback`,grant_type:'authorization_code'}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error('exchange');const tokens=await r.json();if(typeof tokens.id_token!=='string')throw new Error('token');return (await jwtVerify(tokens.id_token,JWKS,{issuer:['https://accounts.google.com','accounts.google.com'],audience:env.GOOGLE_CLIENT_ID,requiredClaims:['exp','iat','sub','aud','iss'],algorithms:['RS256']})).payload;
}
async function readBody(req){const len=Number(req.headers.get('Content-Length'));if(len>LIMIT)throw new Error('body');if(!/^application\/json(?:;|$)/i.test(req.headers.get('Content-Type')||''))throw new Error('body');const reader=req.body?.getReader();if(!reader)throw new Error('body');let size=0,parts=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT){await reader.cancel();throw new Error('body');}parts.push(value);}const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
export function validateSnapshot(d){if(!d||d.version!==1||!Array.isArray(d.entries)||d.entries.length>5000||typeof d.plan!=='string'||d.plan.length>2000)throw new Error('invalid');const seen=new Set();const entries=d.entries.map(e=>{if(!e||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!Number.isFinite(Date.parse(e.date))||new Date(e.date).toISOString().slice(0,10)!==e.date||e.date>new Date(Date.now()+86400000).toISOString().slice(0,10)||seen.has(e.date))throw new Error('date');seen.add(e.date);const v={date:e.date};for(const k of ['urge','loneliness','social','sleep','financialStress']){if(!Number.isInteger(e[k])||e[k]<0||e[k]>10)throw new Error('rating');v[k]=e[k];}if(typeof e.played!=='boolean'||typeof e.note!=='string'||e.note.length>4000||!Array.isArray(e.tags)||e.tags.length>20||e.tags.some(t=>typeof t!=='string'||t.length>80))throw new Error('entry');return {...v,played:e.played,note:e.note,tags:e.tags};});return {version:1,entries:entries.sort((a,b)=>a.date.localeCompare(b.date)),plan:d.plan};}
async function limited(db,key,max,now){const row=await db.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count').bind(key,now+600,now,now).first();return row.count>max;}
async function getSession(req,db,now){const token=cookies(req)[SESSION];if(!token||!/^[a-f0-9]{64}$/.test(token))return null;return db.prepare('SELECT s.token_hash,s.csrf,s.user_id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await hash(token),now).first();}
async function snapshot(db,id){const r=await db.prepare('SELECT revision,data FROM snapshots WHERE user_id=?').bind(id).first();return r?{revision:r.revision,data:JSON.parse(r.data)}:{revision:0,data:empty()};}
export async function handleApi(request,env,testHooks={}){
 const url=new URL(request.url),path=url.pathname,method=request.method,now=Math.floor(Date.now()/1000),appOrigin=origin(env);
 if(!appOrigin||url.origin!==appOrigin)return response({error:'unavailable'},503);
 if(!['GET','HEAD'].includes(method)&&request.headers.get('Origin')!==appOrigin)return response({error:'forbidden'},403);
 if(!env.DB)return response(path==='/api/session'?{configured:false,user:null}:{error:'unavailable'},path==='/api/session'?200:503);
 const db=env.DB;
 try{
 if(path==='/api/auth/google/start'&&method==='GET'){
 if(!configured(env))return response({error:'unavailable'},503);
 if(await limited(db,`login:${await hash(request.headers.get('CF-Connecting-IP')||'unknown')}`,20,now))return response({error:'rate_limited'},429,{'Retry-After':'600'});
 const state=random(),verifier=random(),nonce=random();
 await db.batch([db.prepare('DELETE FROM oauth_states WHERE expires_at<=?').bind(now),db.prepare('DELETE FROM rate_limits WHERE expires_at<=?').bind(now),db.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now),db.prepare('INSERT INTO oauth_states VALUES (?,?,?,?)').bind(await hash(state),verifier,nonce,now+600)]);
 const target=await authorizationURL(env,state,verifier,nonce);
 return redirect(target.toString(),cookie(STATE,state,600));
 }
 if(path==='/api/auth/google/callback'&&method==='GET'){
 try{
 if(!configured(env))throw new Error('config');const state=url.searchParams.get('state'),code=url.searchParams.get('code');if(!state||!/^[a-f0-9]{64}$/.test(state)||state!==cookies(request)[STATE]||!code||code.length>4096)throw new Error('state');
 const saved=await db.prepare('DELETE FROM oauth_states WHERE state_hash=? RETURNING verifier,nonce,expires_at').bind(await hash(state)).first();if(!saved||saved.expires_at<=now)throw new Error('expired');
 let claims;if(testHooks.verifyGoogle)claims=await testHooks.verifyGoogle({code,verifier:saved.verifier,nonce:saved.nonce});else claims=await verifyGoogle(env,code,saved.verifier);
 if((claims.azp!==undefined&&claims.azp!==env.GOOGLE_CLIENT_ID)||(Array.isArray(claims.aud)&&claims.aud.length>1&&claims.azp!==env.GOOGLE_CLIENT_ID)||claims.nonce!==saved.nonce||typeof claims.sub!=='string'||!claims.sub||claims.email_verified!==true||typeof claims.email!=='string')throw new Error('claims');
 const id=random(),token=random(),csrf=random();
 await db.prepare('INSERT INTO users(id,google_sub,email,name,created_at) VALUES (?,?,?,?,?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email,name=excluded.name').bind(id,claims.sub,claims.email,String(claims.name||'').slice(0,200),now).run();
 const user=await db.prepare('SELECT id FROM users WHERE google_sub=?').bind(claims.sub).first();
 const old=cookies(request)[SESSION];const statements=[db.prepare('INSERT INTO snapshots(user_id) VALUES (?) ON CONFLICT DO NOTHING').bind(user.id),db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').bind(await hash(token),user.id,csrf,now+604800)];if(old)statements.push(db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(old)));await db.batch(statements);
 const out=redirect('/account/',cookie(SESSION,token,604800));out.headers.append('Set-Cookie',cookie(STATE,'',0));return out;
 }catch{return redirect('/account/?auth=failed',cookie(STATE,'',0));}
 }
 const session=await getSession(request,db,now);
 if(path==='/api/session'&&method==='GET')return response({configured:configured(env),user:session?{id:session.user_id,name:session.name,email:session.email}:null,...(session?{csrfToken:session.csrf}:{})});
 if(!session)return response({error:'unauthorized'},401);
 if(!['GET','HEAD'].includes(method)&&request.headers.get('X-CSRF-Token')!==session.csrf)return response({error:'forbidden'},403);
 if(await limited(db,`user:${session.user_id}`,180,now))return response({error:'rate_limited'},429,{'Retry-After':'600'});
 if(path==='/api/logout'&&method==='POST'){await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(session.token_hash).run();return response({ok:true},200,{'Set-Cookie':cookie(SESSION,'',0)});}
 if(path==='/api/account'&&method==='DELETE'){let body;try{body=await readBody(request);}catch{return response({error:'invalid_request'},400);}if(body.confirmation!=='DELETE')return response({error:'confirmation_required'},400);await db.batch([db.prepare('DELETE FROM sessions WHERE user_id=?').bind(session.user_id),db.prepare('DELETE FROM snapshots WHERE user_id=?').bind(session.user_id),db.prepare('DELETE FROM rate_limits WHERE key=?').bind(`user:${session.user_id}`),db.prepare('DELETE FROM users WHERE id=?').bind(session.user_id)]);return response({ok:true},200,{'Set-Cookie':cookie(SESSION,'',0)});}
 if((path==='/api/snapshot'||path==='/api/export')&&method==='GET'){const saved=await snapshot(db,session.user_id);return response(path==='/api/export'?{...saved.data,remember:false}:saved,200,path==='/api/export'?{'Content-Disposition':'attachment; filename="addiction-breaker-account.json"'}:{});}
 if(path==='/api/snapshot'&&method==='PUT'){let b,data;try{b=await readBody(request);if(!Number.isSafeInteger(b.baseRevision)||b.baseRevision<0)throw new Error('revision');data=validateSnapshot(b.data);}catch{return response({error:'invalid_snapshot'},400);}
 const updated=await db.prepare('UPDATE snapshots SET data=?,revision=revision+1 WHERE user_id=? AND revision=? RETURNING revision').bind(JSON.stringify(data),session.user_id,b.baseRevision).first();if(!updated)return response({error:'conflict',...await snapshot(db,session.user_id)},409);return response({revision:updated.revision,data});}
 return response({error:'not_found'},404);
 }catch{return response({error:'unavailable'},503);}
}
