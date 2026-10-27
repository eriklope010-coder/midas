# MIDAS — iPhone PWA

## Publicar en GitHub Pages
1. Crea un repositorio GitHub llamado `midas-iphone`.
2. Sube **el contenido de esta carpeta** a la raíz del repositorio (no el ZIP).
3. Ve a **Settings → Pages → Build and deployment → Deploy from a branch**, elige `main` y `/ (root)` y guarda.
4. Abre `https://TU_USUARIO.github.io/midas-iphone/` en Safari en el iPhone.
5. Pulsa Compartir → **Añadir a pantalla de inicio** → Añadir.

## IA y voz
La interfaz funciona como PWA; para respuestas de IA reales necesitas desplegar un backend HTTPS compatible con `POST /chat`, que reciba `{"message":"..."}` y devuelva `{"reply":"..."}`. En MIDAS toca el engranaje y pega la URL completa de ese endpoint. **No pegues una API key en la web ni la publiques en GitHub.** El servidor debe permitir CORS desde el origen de GitHub Pages, tener protección contra abuso y gestionar su propia clave OpenAI.

La voz usa Web Speech API del navegador: su disponibilidad y la escucha continua dependen de la versión de Safari/iOS. No es una llamada telefónica ni voz Realtime bidireccional real; puede requerir volver a tocar el micrófono. Los enlaces a aplicaciones abren páginas o apps cuando iOS lo permite. La información en tiempo real (clima, hora local, noticias) requiere que el backend tenga herramientas o fuentes de datos actualizadas. GitHub Pages solo aloja la interfaz estática, no ejecuta el backend.
