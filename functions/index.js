"use strict";
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {initializeApp}=require("firebase-admin/app");
const {getAuth}=require("firebase-admin/auth");
const {getFirestore}=require("firebase-admin/firestore");
initializeApp();
const PROJECT="jat-vet-pruebas";
const clean=(s,max)=>typeof s==="string"?s.trim().slice(0,max):"";
exports.createJatClient=onCall({region:"us-central1",enforceAppCheck:false,maxInstances:5},async(request)=>{
 if(!request.auth||request.auth.token.jatvetAdmin!==true||request.auth.token.aud!==PROJECT)throw new HttpsError("permission-denied","Solo administradores autorizados.");
 const data=request.data||{};
 const label=clean(data.label,120),email=clean(data.email,254).toLowerCase(),plan=clean(data.plan,30),application=clean(data.application,40),expiry=clean(data.expiry,10),enabled=data.enabled;
 if(!label||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!["Prueba","Básico","Profesional"].includes(plan)||application!=="JAT Vet"||typeof enabled!=="boolean"||(expiry&&!/^\d{4}-\d{2}-\d{2}$/.test(expiry)))throw new HttpsError("invalid-argument","Revisá los datos del cliente.");
 let user;
 try{user=await getAuth().getUserByEmail(email);throw new HttpsError("already-exists","Este correo ya tiene una cuenta. Vinculalo con su UID existente.");}
 catch(e){if(e instanceof HttpsError)throw e;if(e.code!=="auth/user-not-found")throw new HttpsError("internal","No se pudo verificar el correo.");}
 let created;
 try{
  created=await getAuth().createUser({email,emailVerified:false,disabled:false});
  await getFirestore().doc("profiles/"+created.uid).create({label,email,application,plan,expiry,enabled});
  return {uid:created.uid,email};
 }catch(e){
  if(created){try{await getAuth().deleteUser(created.uid)}catch(err){console.error("No se pudo revertir usuario:",created.uid,err)}}
  console.error("Error al crear cliente:",e);
  throw new HttpsError("internal","No se pudo crear el cliente. Revisá los registros de la función.");
 }
});
