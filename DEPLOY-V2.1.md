# Alta completa de clientes — JAT Control V2.1

La función `createJatClient` está preparada pero **no se activa hasta desplegarla** en Firebase.

## Requisitos
- Proyecto Firebase `jat-vet-pruebas`
- Cuenta administradora con claim `jatvetAdmin: true`
- Plan Firebase Blaze y facturación habilitada (Cloud Functions requiere Blaze; puede haber consumo facturable)
- Firebase CLI en Cloud Shell, no en la computadora local

## Despliegue desde Cloud Shell
1. Clonar el repositorio y entrar a su carpeta.
2. Ejecutar `npm --prefix functions install`.
3. Ejecutar `firebase deploy --only functions:createJatClient --project jat-vet-pruebas`.
4. Verificar en Firebase Functions que `createJatClient` esté desplegada.
5. Solo después habilitar el modo automático del formulario de JAT Control.

La función verifica el claim de administrador en el servidor, comprueba los campos, crea la cuenta en Firebase Auth y su perfil en Firestore. Si el perfil falla, intenta revertir la cuenta creada. No gestiona contraseñas ni envía correos desde el servidor.

La interfaz puede solicitar un correo de restablecimiento de contraseña después de la creación; el envío depende de que Firebase Authentication tenga configurado el correo y la política de protección contra enumeración. Antes de habilitarlo, verificar la experiencia de invitación de extremo a extremo.

**No cambiar reglas de Firestore para permitir crear usuarios desde el navegador.**
