const puppeteer = require('puppeteer');
const fs = require('fs');
const https = require('https');
const path = require('path');

// Fungsi untuk membuat folder jika belum ada
const ensureDirExists = (path) => {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path, { recursive: true });
  }
};

// Fungsi untuk mengunduh gambar dan menyimpannya dengan nama tertentu
const downloadImage = (url, path) => new Promise((resolve, reject) => {
  https.get(url, (res) => {
    if (res.statusCode === 200) {
      const fileStream = fs.createWriteStream(path);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        console.log('Downloaded and saved image to', path);
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

// Membaca file JSON dan mengembalikan promise
const readJsonFile = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) reject(err);
      else resolve(JSON.parse(data));
    });
  });
};

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const tpsData = await readJsonFile('tps.json');

  for (const [tpsCode, counts] of Object.entries(tpsData.tps)) {
    const base = 'https://pemilu2024.kpu.go.id/pilpres/hitung-suara/';
    const regionCode1 = tpsCode.substring(0, 2); // Dari 2 angka awal
    const regionCode2 = tpsCode.substring(0, 4); // Dari 4 angka awal
    const regionCode3 = tpsCode.substring(0, 6); // Dari 6 angka awal
    for (let countIndex = 1; countIndex <= counts[0]; countIndex++) {
      const targetUrl = `${base}${regionCode1}/${regionCode2}/${regionCode3}/${tpsCode}/${tpsCode}00${countIndex}`;
      console.log('Processing:', targetUrl);

      try {
        await page.goto(targetUrl, { waitUntil: 'networkidle0' });
        await page.waitForSelector('button.btn.btn-dark.float-end', { visible: true });
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await page.evaluate(() => document.querySelector('button.btn.btn-dark.float-end').click());
        await page.waitForFunction(() => document.querySelectorAll('.card-body .row .col-md-4 a').length > 0, { timeout: 0 });
        
        const imageUrl = await page.evaluate(() => {
          const images = document.querySelectorAll('.card-body .row .col-md-4 a');
          return images.length > 1 ? images[1].href : null;
        });
        
        if (imageUrl) {
          // Modifikasi bagian ini untuk struktur folder yang diinginkan
          const dirPath = path.join(__dirname, 'data', regionCode1, regionCode2, regionCode3);
          ensureDirExists(dirPath);
          const outputPath = path.join(dirPath, `${tpsCode}00${countIndex}.jpg`);
          await downloadImage(imageUrl, outputPath);
        } else {
          console.log('Gambar tidak ditemukan untuk URL:', targetUrl);
        }
      } catch (error) {
        console.log('Error processing URL:', targetUrl, error);
      }
    }
  }

  await browser.close();
})();
