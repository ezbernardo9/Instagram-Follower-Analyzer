const express = require('express');
const multer = require('multer');
const unzipper = require('unzipper');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

// Configurar subida de archivos
const upload = multer({ dest: 'uploads/' });

// Servir archivos estáticos
app.use(express.static('public'));
app.use('/results', express.static('results'));

// Crear carpeta resultados si no existe
if (!fs.existsSync('results')) {
    fs.mkdirSync('results');
}

// Función para extraer usernames válidos desde el HTML
function extraerUsernamesDesdeHTML(htmlContent) {
    const regex = /href="https:\/\/www\.instagram\.com\/([^"/?]+)\/"/g;
    const usernames = new Set();
    let match;
    while ((match = regex.exec(htmlContent)) !== null) {
        let username = match[1].trim().toLowerCase();
        if (/^[a-z0-9._]+$/.test(username)) {
            usernames.add(username);
        }
    }
    return usernames;
}

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta para procesar ZIP
app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No subiste ningún archivo.');
    }

    const extension = path.extname(req.file.originalname).toLowerCase();
    if (extension !== '.zip') {
        fs.unlinkSync(req.file.path);
        return res.status(400).send('<h2 style="color:red;">⚠️ Error: Solo se permiten archivos .ZIP de Instagram.</h2><a href="/">Volver al inicio</a>');
    }

    const tempFolder = `uploads/${Date.now()}`;
    const tempZipPath = req.file.path;

    try {
        await fs.promises.mkdir(tempFolder, { recursive: true });
        await fs.createReadStream(tempZipPath).pipe(unzipper.Extract({ path: tempFolder })).promise();

        const basePath = path.join(tempFolder, 'connections/followers_and_following');

        const followersPath = path.join(basePath, 'followers_1.html');
        const followingPath = path.join(basePath, 'following.html');

        if (!fs.existsSync(followersPath) || !fs.existsSync(followingPath)) {
            throw new Error("No se encontraron los archivos followers_1.html o following.html.");
        }

        const followersHTML = fs.readFileSync(followersPath, 'utf-8');
        const followingHTML = fs.readFileSync(followingPath, 'utf-8');

        const followers = extraerUsernamesDesdeHTML(followersHTML);
        const following = Array.from(extraerUsernamesDesdeHTML(followingHTML));

        const noMeSiguen = following
            .filter(user => !followers.has(user))
            .sort((a, b) => a.localeCompare(b));

        if (noMeSiguen.length === 0) {
            res.send(`
                <div class="container" style="max-width: 600px; margin: 50px auto; padding-top: 100px; text-align: center;">
                    <div class="card p-5 shadow">
                        <h2 class="text-success mb-3">🎉 ¡Todo en orden!</h2>
                        <p class="text-muted">No encontramos ninguna cuenta que no te siga de vuelta. ¡Excelente!</p>
                        <a href="/" class="btn btn-dark mt-4">⬅️ Volver al inicio</a>
                    </div>
                </div>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            `);
        } else {
            const fileName = `results/resultado-${Date.now()}.txt`;
            fs.writeFileSync(fileName, noMeSiguen.map(user => `@${user}`).join('\n'));

            res.send(`
                <div class="container" style="max-width: 700px; margin: 50px auto; text-align: center;">
                    <div class="card p-5 shadow">
                        <h2 class="text-danger mb-3">👥 ${noMeSiguen.length} personas no te siguen:</h2>
                        <p class="text-muted">Te mostramos la lista completa a continuación:</p>
                        <ul class="list-group list-group-flush my-4">
                            ${noMeSiguen.map(user => `<li class="list-group-item">@${user}</li>`).join('')}
                        </ul>
                        <a href="/${fileName}" download class="btn btn-dark mt-4">📥 Descargar lista en .txt</a><br><br>
                        <a href="/" class="btn btn-secondary">⬅️ Volver al inicio</a>
                    </div>
                </div>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            `);
        }

        // Limpiar temporales
        fs.unlinkSync(tempZipPath);
        fs.rmSync(tempFolder, { recursive: true, force: true });

    } catch (error) {
        console.error(error);
        res.status(500).send('<h2 style="color:red;">❌ Error procesando tu archivo. Asegurate de mandar el ZIP correcto de Instagram.</h2><a href="/">Volver al inicio</a>');
    }
});

// Iniciar servidor
app.listen(3000, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:3000`);
});
