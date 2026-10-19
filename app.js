import{initializeApp}from'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import{getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,getIdTokenResult}from'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import{getFirestore,collection,doc,getDocs,getDoc,setDoc,updateDoc}from'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const config={apiKey:'AIzaSyBsdw3MfmtfXn3aCcCV6_IQzX6v3Qw7Yvs',authDomain:'jat-vet-pruebas.firebaseapp.com',projectId:'jat-vet-pruebas',storageBucket:'jat-vet-pruebas.firebasestorage.app',messagingSenderId:'687038553989',appId:'1:687038553989:web:a34c236cb368fd44d92eec'};
const app=initializeApp(config),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
let admin=false,profiles=[],editingUid=null;

const backupCollections=['pets','turns','procedures','services','money','studies','vaccinations','audit'];
function backupFileName(p,day){const name=String(p.label||p.email||'Cliente').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,65)||'Cliente';return name+'-JAT-Vet-'+day+'.json'}
function backupSummary(data){return backupCollections.reduce((sum,key)=>sum+(Array.isArray(data[key])?data[key].length:0),0)}
async function readClientBackup(uid){
 const root=await getDoc(doc(db,'workspaces',uid));
 if(!root.exists())return {status:'empty',revision:0,data:null,count:0};
 const {revision,count}=root.data();
 if(!Number.isInteger(revision)||revision<1||!Number.isInteger(count)||count<1||count>390)throw Error('Manifiesto inválido');
 const pieces=[];
 for(let n=0;n<count;n+=20){
  const batch=await Promise.all(Array.from({length:Math.min(20,count-n)},(_,i)=>getDoc(doc(db,'workspaces',uid,'chunks',String(n+i)))));
  for(const chunk of batch){if(!chunk.exists()||typeof chunk.data().payload!=='string')throw Error('Falta un bloque de datos');pieces.push(chunk.data().payload)}
 }
 const raw=pieces.join('');
 const data=JSON.parse(raw);
 if(!data||typeof data!=='object'||Array.isArray(data)||!backupCollections.every(k=>Array.isArray(data[k])))throw Error('Estructura del respaldo inválida');
 const after=await getDoc(doc(db,'workspaces',uid));
 if(!after.exists()||after.data().revision!==revision||after.data().count!==count)throw Error('Los datos cambiaron durante la lectura; volvé a ejecutar el respaldo');
 return {status:'ok',revision,data,count};
}
async function runAllBackups(){
 if(!admin||!auth.currentUser)return;
 const button=$('runBackups'),status=$('backupStatus'),body=$('backupResults');
 if(!window.JSZip){status.textContent='No se pudo cargar el generador ZIP. Revisá la conexión y volvé a intentar.';return}
 button.disabled=true;body.replaceChildren();
 const zip=new window.JSZip(),date=new Date(),stamp=date.toISOString().replace(/[:.]/g,'-'),folder=zip.folder('clientes'),results=[];
 try{
  await load();
  const customers=profiles.filter(p=>!p.application||p.application==='JAT Vet').sort((a,b)=>String(a.label||a.email||a.uid).localeCompare(String(b.label||b.email||b.uid),'es'));
  if(!customers.length){status.textContent='No hay perfiles JAT Vet para respaldar.';return}
  for(let i=0;i<customers.length;i++){
   if(!admin||!auth.currentUser)throw Error('Se cerró la sesión administrativa');
   const p=customers[i],row=document.createElement('tr');
   status.textContent='Leyendo '+(i+1)+' de '+customers.length+': '+(p.label||p.uid);
   try{
    const result=await readClientBackup(p.uid);
    if(result.status==='empty'){
     results.push({uid:p.uid,label:p.label,email:p.email||'',status:'sin datos',records:0});
     row.innerHTML='<td></td><td>Sin datos guardados</td><td>0</td>';
    }else{
     const records=backupSummary(result.data);
     let filename=backupFileName(p,date.toISOString().slice(0,10));if(folder.file(filename))filename=filename.replace(/\.json$/,'-'+p.uid.slice(0,8)+'.json');
     folder.file(filename,JSON.stringify(result.data,null,2));
     results.push({uid:p.uid,label:p.label,email:p.email||'',status:'correcto',revision:result.revision,records,filename});
     row.innerHTML='<td></td><td>✓ Respaldado</td><td></td>';
     row.cells[2].textContent=String(records);
    }
   }catch(error){
    results.push({uid:p.uid,label:p.label,email:p.email||'',status:'ERROR',error:String(error.message||error)});
    row.innerHTML='<td></td><td>✕ Error de lectura</td><td>—</td>';
   }
   row.cells[0].textContent=p.label||p.email||p.uid;
   body.append(row);
  }
  const failures=results.filter(x=>x.status==='ERROR');
  const manifest={createdAt:date.toISOString(),application:'JAT Vet V4',type:'copia externa por administrador',complete:failures.length===0,clients:results};
  zip.file('informe-respaldo.json',JSON.stringify(manifest,null,2));
  const indexRows=[['Cliente','Correo','Estado','Registros','Archivo','UID'],...results.map(x=>[x.label||'',x.email||'',x.status,x.records??'',x.filename||'',x.uid])];
  const csvCell=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
  zip.file('INDICE-DE-CLIENTES.csv','\uFEFF'+indexRows.map(row=>row.map(csvCell).join(';')).join('\r\n'));
  zip.file('LEEME.txt','JAT Control - Copia de seguridad privada\\nFecha: '+date.toISOString()+'\\n'+(failures.length?'ATENCION: Hay clientes con errores. El respaldo NO esta completo.':'Lecturas finalizadas sin errores.')+'\\nConservar este ZIP fuera de carpetas publicas.\\n');
  const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:5}});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='JAT-Respaldos-'+stamp+(failures.length?'-INCOMPLETO':'')+'.zip';document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  status.textContent=failures.length?'ZIP generado con '+failures.length+' errores. Revisá el informe; respaldo INCOMPLETO.':'ZIP generado: '+results.filter(x=>x.status==='correcto').length+' espacios respaldados y '+results.filter(x=>x.status==='sin datos').length+' sin datos. Verificá que el archivo se haya descargado.';
 }catch(error){status.textContent='No se completó el proceso: '+String(error.message||error)}
 finally{button.disabled=false}
}
$('runBackups').onclick=runAllBackups;

function planStatus(p){if(!p.expiry)return {text:'Sin fecha',type:''};const today=new Date(),local=new Date(today.getFullYear(),today.getMonth(),today.getDate());const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(p.expiry);if(!match)return {text:'Fecha inválida',type:'warn'};const date=new Date(+match[1],+match[2]-1,+match[3]);if(date.getFullYear()!==+match[1]||date.getMonth()!==+match[2]-1||date.getDate()!==+match[3])return {text:'Fecha inválida',type:'warn'};const days=Math.round((date-local)/86400000);return days<0?{text:'Vencido',type:'expired'}:days<=7?{text:days===0?'Vence hoy':`Por vencer (${days} d)`,type:'warn'}:{text:'Al día',type:''}}
function formatExpiry(v){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v||'');return m?`${m[3]}/${m[2]}/${m[1]}`:'sin fecha'}
function messageFor(p){const status=planStatus(p),date=formatExpiry(p.expiry),name=p.label||'cliente';const action=status.type==='expired'?`tu plan ${p.plan||'de JAT Vet'} venció el ${date}`:`tu plan ${p.plan||'de JAT Vet'} vence el ${date}`;return `Hola, ${name}. Te contactamos desde JAT Soluciones Informáticas para recordarte que ${action}. Para coordinar la renovación, respondé a este mensaje. ¡Muchas gracias!`}
function notify(p,channel){if(!p.expiry){msg('Este cliente no tiene fecha de vencimiento.');return}const body=messageFor(p);if(channel==='mail'){if(!p.email){msg('Primero cargá el correo del cliente.');return}const url=`mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent('Recordatorio de vencimiento · JAT Vet')}&body=${encodeURIComponent(body)}`;window.location.href=url;return}const supplied=prompt('Número de WhatsApp del cliente con código de país, sin 0 ni 15 (ej. 54911XXXXXXXX):');if(supplied===null)return;const phone=supplied.replace(/[^\d]/g,'');if(phone.length<10||phone.length>15){msg('Ingresá un teléfono válido con código de país.');return}window.open(`https://wa.me/${phone}?text=${encodeURIComponent(body)}`,'_blank','noopener,noreferrer')}

function show(ok){$('login').classList.toggle('hidden',ok);$('dashboard').classList.toggle('hidden',!ok);$('logout').classList.toggle('hidden',!ok);$('adminTag').classList.toggle('hidden',!ok)}
function msg(text){$('status').textContent=text}
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginError').textContent='';try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value)}catch(e){$('loginError').textContent='No se pudo iniciar sesión. Revisá tus credenciales.'}};
$('logout').onclick=()=>signOut(auth);
onAuthStateChanged(auth,async user=>{admin=false;show(false);if(!user)return;try{const token=await getIdTokenResult(user,true);if(token.claims.jatvetAdmin!==true){$('loginError').textContent='Esta cuenta no tiene permiso de administrador en Firebase.';return}admin=true;show(true);await load()}catch(e){$('loginError').textContent='No se pudo verificar el permiso de administrador.'}});
async function load(){if(!admin)return;msg('');try{const snap=await getDocs(collection(db,'profiles'));profiles=snap.docs.map(d=>({uid:d.id,...d.data()}));$('total').textContent=profiles.length;$('active').textContent=profiles.filter(x=>x.enabled).length;updateMetrics();render()}catch(e){msg('No se pudieron cargar los perfiles: '+e.message)}}
function updateMetrics(){const counts={current:0,warn:0,expired:0,none:0};for(const p of profiles){const s=planStatus(p);counts[s.type==='warn'?'warn':s.type==='expired'?'expired':p.expiry?'current':'none']++} $('soon').textContent=counts.warn;$('expired').textContent=counts.expired;$('chartTotal').textContent=profiles.length;$('chartCurrent').textContent=counts.current;$('chartSoon').textContent=counts.warn;$('chartExpired').textContent=counts.expired;$('chartNone').textContent=counts.none;const n=profiles.length||1;let offset=0;const segments=[['#1cbd73',counts.current],['#ffbf2c',counts.warn],['#f14e56',counts.expired],['#dbe5f0',counts.none]].map(([color,num])=>{const start=offset;offset+=num/n*100;return color+' '+start+'% '+offset+'%'});$('donut').style.background=profiles.length?'conic-gradient('+segments.join(',')+')':'#dbe5f0';const upcoming=profiles.filter(p=>p.expiry&&['warn','expired'].includes(planStatus(p).type)).sort((a,b)=>a.expiry.localeCompare(b.expiry)).slice(0,5);$('upcoming').replaceChildren();if(!upcoming.length){$('upcoming').textContent='No hay vencimientos próximos ni pendientes.';return}for(const p of upcoming){const item=document.createElement('div');item.className='upcomingitem';const name=document.createElement('strong');name.textContent=p.label||'Cliente';const info=document.createElement('span');info.textContent=formatExpiry(p.expiry)+' · '+planStatus(p).text;item.append(name,info);$('upcoming').append(item)}}
function render(){const q=$('search').value.trim().toLocaleLowerCase();const filter=$('statusFilter').value;const filtered=profiles.filter(p=>[p.label,p.email,p.uid].some(x=>String(x||'').toLocaleLowerCase().includes(q))).filter(p=>filter==='all'||(filter==='none'&&!p.expiry)||(filter==='current'&&!!p.expiry&&planStatus(p).type==='')||planStatus(p).type===filter);$('users').replaceChildren();$('empty').classList.toggle('hidden',filtered.length>0);for(const p of filtered){const tr=document.createElement('tr');const cell=(value)=>{const td=document.createElement('td');td.textContent=value;tr.append(td);return td};const td=cell(p.label||'Sin nombre');const small=document.createElement('div');small.className='muted small';small.textContent=p.email||'Correo no registrado';td.append(small);cell(p.application||'JAT Vet');cell(p.plan||'Sin plan');cell(formatExpiry(p.expiry));const ps=planStatus(p),planCell=cell(''),planPill=document.createElement('span');planPill.className='pill '+ps.type;planPill.textContent=ps.text;planCell.append(planPill);const state=cell('');const pill=document.createElement('span');pill.className='pill'+(p.enabled?'':' off');pill.textContent=p.enabled?'Activo':'Suspendido';state.append(pill);const actions=cell('');actions.className='actions';const edit=document.createElement('button');edit.className='ghost';edit.textContent='Editar';edit.onclick=()=>openEditor(p);const toggle=document.createElement('button');toggle.className=p.enabled?'danger':'ghost';toggle.textContent=p.enabled?'Suspender':'Habilitar';toggle.onclick=async()=>{if(!confirm('¿'+(p.enabled?'Suspender':'Habilitar')+' acceso de '+(p.label||p.uid)+'?'))return;toggle.disabled=true;try{await updateDoc(doc(db,'profiles',p.uid),{enabled:!p.enabled});await load()}catch(e){msg('Error al actualizar: '+e.message)}finally{toggle.disabled=false}};const whatsapp=document.createElement('button');whatsapp.className='notify';whatsapp.textContent='WhatsApp';whatsapp.title='Preparar aviso por WhatsApp';whatsapp.onclick=()=>notify(p,'whatsapp');const mail=document.createElement('button');mail.className='notify';mail.textContent='Correo';mail.title='Preparar aviso por correo';mail.onclick=()=>notify(p,'mail');actions.append(edit,toggle,whatsapp,mail);$('users').append(tr)}}
$('search').oninput=render;$('refresh').onclick=load;
function openEditor(p=null){editingUid=p?.uid||null;$('profileForm').reset();$('dialogStatus').textContent='';$('dialogTitle').textContent=p?'Editar cliente':'Registrar cliente';$('uid').readOnly=!!p;$('uid').value=p?.uid||'';$('label').value=p?.label||'';$('clientEmail').value=p?.email||'';$('clientApp').value=p?.application||'JAT Vet';$('plan').value=p?.plan||'Prueba';$('expiry').value=p?.expiry||'';$('enabled').checked=p?.enabled??true;$('clientDialog').showModal()}
$('newClient').onclick=()=>openEditor();$('closeDialog').onclick=()=>$('clientDialog').close();
$('profileForm').onsubmit=async e=>{e.preventDefault();if(!admin)return;const uid=$('uid').value.trim(),label=$('label').value.trim(),email=$('clientEmail').value.trim().toLowerCase();if(!uid||uid.includes('/')||!label){$('dialogStatus').textContent='Completá el UID y el nombre.';return}const save=$('saveProfile');save.disabled=true;$('dialogStatus').textContent='';try{const ref=doc(db,'profiles',uid);if(!editingUid){const existing=await getDoc(ref);if(existing.exists())throw Error('Este UID ya tiene un perfil. Usá Editar.')}const fields={label,email,application:$('clientApp').value,plan:$('plan').value,expiry:$('expiry').value,enabled:$('enabled').checked};if(editingUid){await updateDoc(ref,fields)}else{await setDoc(ref,fields)}$('clientDialog').close();await load();msg('Cliente guardado correctamente.')}catch(e){$('dialogStatus').textContent='No se pudo guardar: '+e.message}finally{save.disabled=false}};

$('statusFilter').onchange=render;$('quickClient').onclick=()=>openEditor();$('quickStats').onclick=()=>$('stats').scrollIntoView({behavior:'smooth'});$('quickWhatsapp').onclick=()=>{$('clients').scrollIntoView({behavior:'smooth'});msg('Elegí WhatsApp en la fila del cliente al que querés avisar.')};$('quickMail').onclick=()=>{$('clients').scrollIntoView({behavior:'smooth'});msg('Elegí Correo en la fila del cliente al que querés avisar.')};document.querySelectorAll('.navbtn').forEach(b=>b.onclick=()=>{document.querySelectorAll('.navbtn').forEach(x=>x.classList.toggle('selected',x===b));document.getElementById(b.dataset.target)?.scrollIntoView({behavior:'smooth',block:'start'})});
