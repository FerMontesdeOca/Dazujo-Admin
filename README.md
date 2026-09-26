# Dazujo - Administracion

App web con dos secciones:

- **Cuentas por Pagar**: proveedor, concepto, numero de factura, fechas de emision y vencimiento, monto. Avisa por correo cuando una factura esta por vencer.
- **Gastos**: sucursal, tipo de gasto, concepto, fecha, monto (proveedor y numero de factura opcionales).

Ambas secciones se pueden capturar desde la pagina principal y exportar a CSV o Excel. El diseño se adapta a celular y tablet.

## 1. Requisitos

- [Node.js](https://nodejs.org) 18 o superior instalado.

## 2. Instalacion local

```bash
npm install
copy .env.example .env
```

Edita el archivo `.env` con tus datos (ver siguiente seccion para el correo).

```bash
npm start
```

Abre [http://localhost:3000](http://localhost:3000).

## 3. Crear tu primer usuario (login)

La app pide iniciar sesion, asi que antes de entrar necesitas crear tu propio usuario administrador desde la terminal:

```bash
npm run crear-usuario
```

Te va a pedir nombre, email, contraseña y si es administrador (responde "s" para tu primer usuario). Con ese usuario ya puedes entrar en `http://localhost:3000/login.html`.

Una vez adentro, si tu usuario es administrador, veras la seccion **Usuarios** en el menu: ahi puedes crear cuentas para el resto del equipo, desactivarlas o restablecerles la contraseña, sin volver a usar la terminal.

## 4. Configurar el envio de correos (Gmail)

Gmail no permite usar tu contraseña normal desde apps externas, necesitas una "contraseña de aplicacion":

1. Entra a [myaccount.google.com/security](https://myaccount.google.com/security).
2. Activa la "Verificacion en 2 pasos" si no la tienes activada (es requisito).
3. Busca "Contraseñas de aplicaciones" (o entra directo a [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)).
4. Crea una nueva, ponle de nombre "Cuentas por pagar", y copia la contraseña de 16 caracteres que te da.
5. En tu archivo `.env`:
   - `GMAIL_USER` = tu correo de Gmail.
   - `GMAIL_APP_PASSWORD` = la contraseña de 16 caracteres (sin espacios).
   - `NOTIFY_EMAIL_TO` = a que correo(s) quieres que lleguen los avisos (puedes poner varios separados por coma).
   - `DIAS_AVISO_VENCIMIENTO` = con cuantos dias de anticipacion avisar (3 por defecto).

La app revisa automaticamente todos los dias a las 8:00 am (hora del servidor) si hay facturas por vencer y, si las hay, envia un correo. Tambien puedes forzar una revision manual llamando a `POST /api/cuentas/revisar-vencimientos`.

## 4b. Configurar avisos por WhatsApp (Twilio)

Ademas del correo, la app puede mandar un WhatsApp automatico 7 dias, 3 dias y 1 dia antes de que venza cada cuenta por pagar (cada aviso se manda una sola vez por cuenta).

1. Crea una cuenta en [twilio.com](https://www.twilio.com/) y entra a la [consola](https://console.twilio.com/).
2. Copia tu **Account SID** y **Auth Token** (estan en el dashboard principal).
3. Activa el **WhatsApp Sandbox** de Twilio (Messaging → Try it out → Send a WhatsApp message) para pruebas, o solicita un numero de WhatsApp de negocio verificado para produccion. En ambos casos obtienes un numero remitente (ej. `whatsapp:+14155238886`).
4. Si usas el sandbox, cada numero que vaya a recibir avisos debe primero enviarle al numero de Twilio el codigo `join <palabra-clave>` desde WhatsApp (Twilio te lo indica en la consola); si no, Twilio rechazara los mensajes a ese numero.
5. En tu archivo `.env`:
   - `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN` = los que copiaste en el paso 2.
   - `TWILIO_WHATSAPP_FROM` = el numero remitente del paso 3.
   - `NOTIFY_WHATSAPP_TO` = el/los numero(s) que deben recibir los avisos, en formato `+52155XXXXXXXX` (separados por coma si son varios).

6. **Plantilla aprobada (necesaria para que lleguen los recordatorios):** WhatsApp solo deja que una empresa le escriba a alguien por iniciativa propia si usa una *plantilla aprobada*. Sin plantilla, el mensaje solo llega si esa persona le escribio al numero de Twilio en las ultimas 24 horas (Twilio lo rechaza con el error 63016). Para crearla:
   - En la consola de Twilio entra a Messaging → Content Template Builder → Create new, tipo "Text".
   - Texto sugerido: `📌 Aviso de pago: la cuenta de *{{1}}* ({{2}}) por {{3}} vence {{4}} ({{5}}).`
   - Mandala a aprobar para WhatsApp (categoria "Utility"). Cuando este aprobada copia su **Content SID** (empieza con `HX`) en `TWILIO_WHATSAPP_CONTENT_SID`.
   - Variables: {{1}} proveedor, {{2}} concepto, {{3}} monto, {{4}} cuando vence (hoy / manana / en N dias), {{5}} fecha de vencimiento.

La revision corre a las 8:00 am hora de Mexico (se puede cambiar con `ZONA_HORARIA`) y tambien al arrancar el servidor. Si una cuenta se registra con menos de 7 dias de anticipacion, o un dia no corrio la revision, se manda el aviso que corresponda en cuanto se detecta. Si cambias la fecha de vencimiento de una cuenta, sus avisos se vuelven a programar.

Para revisar que todo este bien configurado, un administrador puede usar el boton **"Probar WhatsApp"** en Cuentas por Pagar: manda un mensaje de prueba y dice por cada numero si llego o por que Twilio lo rechazo.

Si estas variables no estan configuradas, la app simplemente omite el envio de WhatsApp (sin afectar el resto de la app ni el aviso por correo).

## 5. Exportar informacion

En cada seccion hay dos botones: "Exportar CSV" y "Exportar Excel", descargan toda la informacion registrada.

## 6. Publicarla para que la vea tu equipo (Railway)

Railway permite correr esta app con almacenamiento persistente para la base de datos (SQLite) de forma sencilla:

1. Crea una cuenta en [railway.app](https://railway.app).
2. Sube este proyecto a un repositorio de GitHub (o usa `railway up` desde la terminal con el [CLI de Railway](https://docs.railway.app/guides/cli)).
3. En Railway, crea un nuevo proyecto y conecta el repositorio.
4. En "Variables", agrega las mismas variables del archivo `.env` (`GMAIL_USER`, `GMAIL_APP_PASSWORD`, `NOTIFY_EMAIL_TO`, `DIAS_AVISO_VENCIMIENTO`, y si usas WhatsApp: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `NOTIFY_WHATSAPP_TO`, `TWILIO_WHATSAPP_CONTENT_SID`).
5. En "Settings" agrega un **Volume** montado en la ruta `/app/data` para que la base de datos no se borre en cada despliegue.
6. Railway detecta automaticamente que es una app de Node y ejecuta `npm start`. Al terminar te da una URL publica (algo como `tuapp.up.railway.app`) que puedes compartir con tu equipo.
7. Una vez publicada, entra a la terminal de Railway (o corre el script localmente contra la base de datos remota) y ejecuta `npm run crear-usuario` para crear tu primer administrador ahi tambien.

