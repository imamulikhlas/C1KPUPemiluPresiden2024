const puppeteer = require('puppeteer');
const fs = require('fs');
const https = require('https');
const path = require('path');

// Fungsi untuk membuat folder jika belum ada
const ensureDirExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Fungsi untuk mengunduh gambar
const downloadImage = (url, outputPath) => new Promise((resolve, reject) => {
  https.get(url, (res) => {
    if (res.statusCode === 200) {
      const fileStream = fs.createWriteStream(outputPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        console.log('Downloaded and saved image to', outputPath);
        resolve();
      });
    } else {
      console.log('Image not found:', url);
      reject('Image not found');
    }
  }).on('error', (err) => {
    console.log('Error downloading the image:', err);
    reject(err);
  });
});

// Membaca file JSON
const readJsonFile = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) reject(err);
      else resolve(JSON.parse(data));
    });
  });
};

// Fungsi untuk menambahkan data error ke dalam file JSON dengan timestamp
const appendErrorData = (tpsCode, errorCount) => {
  const errorFilePath = path.join(__dirname, 'error-data.json');
  fs.readFile(errorFilePath, (err, data) => {
    let errorData = {};
    if (!err && data) {
      errorData = JSON.parse(data);
    } else {
      errorData['tps-error'] = {};
    }
    if (!errorData['tps-error'][tpsCode]) {
      errorData['tps-error'][tpsCode] = [];
    }
    errorData['tps-error'][tpsCode].push(errorCount);

    // Menambahkan timestamp
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
    errorData['last-updated'] = timestamp;

    fs.writeFile(errorFilePath, JSON.stringify(errorData, null, 2), (err) => {
      if (err) console.log('Error saving error data:', err);
    });
  });
};

// Fungsi untuk mengunjungi setiap halaman dan mengunduh gambar
const processTps = async (browser, tpsCode, base, regionCode1, regionCode2, regionCode3, countIndex, updateProgress) => {
  const page = await browser.newPage();
  const targetUrl = `${base}${regionCode1}/${regionCode2}/${regionCode3}/${tpsCode}/${tpsCode}00${countIndex}`;
  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle0' });
    await page.waitForSelector('button.btn.btn-dark.float-end', { visible: true, timeout: 10000 });
    await page.evaluate(() => document.querySelector('button.btn.btn-dark.float-end').click());
    await page.waitForFunction(() => document.querySelectorAll('.card-body .row .col-md-4 a').length > 0, { timeout: 10000 });
    
    const imageUrl = await page.evaluate(() => {
      const images = document.querySelectorAll('.card-body .row .col-md-4 a');
      return images.length > 1 ? images[1].href : null;
    });
    
    if (imageUrl) {
      const dirPath = path.join(__dirname, 'data', regionCode1, regionCode2, regionCode3);
      ensureDirExists(dirPath);
      const outputPath = path.join(dirPath, `${tpsCode}00${countIndex}.jpg`);
      await downloadImage(imageUrl, outputPath);
    } else {
      console.log('Gambar tidak ditemukan untuk URL:', targetUrl);
      appendErrorData(tpsCode, countIndex); // Log error jika gambar tidak ditemukan
    }
  } catch (error) {
    console.log('Error processing URL:', targetUrl, error);
    appendErrorData(tpsCode, countIndex); // Log error untuk setiap jenis error
  } finally {
    updateProgress();
    await page.close();
  }
};

// Fungsi utama untuk menjalankan proses paralel
const main = async () => {
  const browser = await puppeteer.launch({ headless: true });
  const tpsData = await readJsonFile('tps.json');
  const base = 'https://pemilu2024.kpu.go.id/pilpres/hitung-suara/';
  let completedTasks = 0;
  const totalTasks = Object.values(tpsData.tps).reduce((acc, curr) => acc + curr[0], 0);

  const updateProgress = () => {
    completedTasks++;
    const progress = (completedTasks / totalTasks) * 100;
    console.log(`Progress: ${progress.toFixed(2)}% completed.`);
  };

  const tasks = [];

  for (const [tpsCode, counts] of Object.entries(tpsData.tps)) {
    const regionCode1 = tpsCode.substring(0, 2);
    const regionCode2 = tpsCode.substring(0, 4);
    const regionCode3 = tpsCode.substring(0, 6);
    for (let countIndex = 1; countIndex <= counts[0]; countIndex++) {
      tasks.push(processTps(browser, tpsCode, base, regionCode1, regionCode2, regionCode3, countIndex, updateProgress));
      if (tasks.length >= 5) {
        await Promise.all(tasks.splice(0, 5));
      }
    }
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }

  await browser.close();
};

main().catch(console.error);
