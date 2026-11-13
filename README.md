# JARVIS MIDAS (versión gratis, voz a voz)

Tu asistente personal estilo MIDAS: le hablas, te contesta en voz alta y vuelve a escucharte solo. Es tu colega: chistes, recomendaciones, internet, el tiempo, cálculos exactos y memoria. Abre WhatsApp, Instagram, TikTok, Plex y Spotify.

**Coste: 0 €.** Usa la IA gratuita de Google (Gemini), un servidor gratuito (Render), búsquedas gratuitas (Tavily) y el tiempo gratuito (Open-Meteo).

Todos los archivos van en la misma carpeta. Aquí no hay ninguna clave: las claves se ponen solo en Render.

---

## Paso 1: Consigue las claves gratis

**Clave de Gemini (obligatoria)**
1. Entra en **aistudio.google.com** con tu cuenta de Google.
2. Pulsa **Get API key › Create API key** y cópiala.

**Clave de Tavily (opcional, para noticias y actualidad)**
1. Entra en **tavily.com** y pulsa **Sign up**. No hace falta tarjeta.
2. Copia tu API key, que empieza por `tvly-`. Te da 1.000 búsquedas gratis al mes.
3. Sin esta clave, Jarvis solo busca en Wikipedia y no sabrá noticias ni resultados de última hora.

**Tu token**
Inventa una contraseña de al menos 32 letras y números, y guárdala.

## Paso 2: Sube los archivos a GitHub
1. En **github.com**, pulsa **New repository**, ponle el nombre `jarvis` y márcalo como **Public**.
2. Pulsa **Add file › Upload files**, arrastra todos los archivos y pulsa **Commit changes**.
3. Ve a **Settings › Pages**:
   - **Source:** Deploy from a branch.
   - **Branch:** `main`, carpeta `/ (root)`.
   - Pulsa **Save**.
4. En un minuto tendrás tu web en `https://TU-USUARIO.github.io/jarvis/`.

## Paso 3: Crea el servidor en Render (gratis)
1. Entra en **render.com** y regístrate con tu cuenta de GitHub.
2. Pulsa **New › Web Service** y elige el repositorio `jarvis`.
3. Rellena el formulario:
   - **Language:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
4. En **Environment Variables** añade:

| Nombre | Valor |
|---|---|
| `GEMINI_API_KEY` | tu clave de Google |
| `TAVILY_API_KEY` | tu clave de Tavily (opcional) |
| `ALLOWED_ORIGINS` | `https://TU-USUARIO.github.io` (sin `/jarvis` y sin barra al final) |
| `JARVIS_DEVICE_TOKEN` | tu token |

5. Pulsa **Deploy Web Service** y espera a que ponga **Live**.
6. Comprueba que funciona: abre `https://TU-SERVIDOR.onrender.com/health`. Debe salir `"ok":true` y `"keyConfigured":true`.

## Paso 4: Conecta y habla
1. Abre tu web en **Safari** en el iPhone.
2. Entra en el **engranaje › Servidor**, pega la dirección de Render y tu token, y pulsa **Guardar y comprobar**.
3. Cierra Ajustes, toca el orbe o la onda dorada y permite el micrófono.
4. Habla. Jarvis te contesta y vuelve a escucharte solo, sin tocar nada.

---

## Cómo es la conversación
- **Hablas** y Safari detecta cuándo terminas.
- **Jarvis piensa:** busca en internet, mira el tiempo o calcula si hace falta.
- **Te contesta en voz alta** y vuelve a escuchar.
- **Para cortarle,** toca el orbe.
- **Tras unos 3 o 4 minutos de silencio** se pausa para no gastar batería. Toca el orbe para seguir.
- **Para abrir una app** («abre WhatsApp»), Jarvis te pone un botón y tú le das un toque. El iPhone no deja que una web abra apps sola.

## Si algo falla
| Problema | Solución |
|---|---|
| «No llego al servidor» | `ALLOWED_ORIGINS` mal escrito, o el servidor está dormido. La primera vez tarda unos 30 segundos. |
| «Ha rechazado el token» | El token de la web y el de Render no son idénticos. |
| «Límite gratuito» | Has hecho muchas preguntas seguidas. Espera un rato; el límite diario se renueva cada noche. |
| «El modelo no existe» | En Render, pon `GEMINI_MODEL` = `gemini-3.6-flash`. |
| No te oye | Ajustes del iPhone › Safari › Micrófono › Permitir. Usa Safari normal; si la abriste desde la pantalla de inicio y no oye, prueba en Safari. |
| Voz muy baja tras hablarle | Es un fallo conocido de iOS al compartir micrófono y altavoz. Sube el volumen o usa auriculares. |

## Límites
- **Solo con la web abierta.** Jarvis te escucha mientras tienes la web abierta y la pantalla encendida, no con el móvil bloqueado; ninguna web puede.
- **Privacidad del plan gratuito.** Google puede revisar y usar tus conversaciones para mejorar sus productos. No le cuentes nada muy privado.
- **Memoria en el navegador.** Se guarda en el navegador de ese dispositivo. Expórtala de vez en cuando en Ajustes › Memoria.
- **Servidor dormido.** El plan gratuito de Render se duerme tras unos 15 minutos sin uso, y la primera respuesta tarda unos 30 segundos.
- **Spotify.** Jarvis abre la búsqueda, pero no puede darle al play.
