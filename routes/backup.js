const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const archiver = require('archiver');
const unzipper = require('unzipper');

const upload = multer({ dest: path.join(__dirname, '../temp') });

router.get('/export', async (req, res) => {
  try {
    const backupName = `backup_${Date.now()}.zip`;
    const tempPath = path.join(__dirname, `../temp/${backupName}`);

    const output = fs.createWriteStream(tempPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      res.download(tempPath, backupName, () => {
        fs.unlink(tempPath, () => {});
      });
    });

    archive.on('error', err => {
      throw err;
    });

    archive.pipe(output);

    const dbPath = path.join(__dirname, '../database/nav.db');
    archive.file(dbPath, { name: 'database/nav.db' });

    const uploadsDir = path.join(__dirname, '../uploads');
    if (fs.existsSync(uploadsDir)) {
      archive.directory(uploadsDir, 'uploads');
    }

    await archive.finalize();
  } catch (err) {
    console.error('备份失败:', err);
    res.status(500).json({ error: '备份失败' });
  }
});

router.post('/import', upload.any(), async (req, res) => {
  let extractRoot = null;

  try {
    const file = req.files && req.files[0];
    if (!file) {
      return res.status(400).json({ error: '未上传备份文件' });
    }

    const ext = path.extname(file.originalname || '');
    if (ext.toLowerCase() !== '.zip') {
      fs.unlink(file.path, () => {});
      return res.status(400).json({ error: '备份文件必须为 .zip 格式' });
    }

    const tempRoot = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempRoot)) {
      fs.mkdirSync(tempRoot, { recursive: true });
    }

    extractRoot = path.join(tempRoot, `import_${Date.now()}`);
    fs.mkdirSync(extractRoot, { recursive: true });

    await fs
      .createReadStream(file.path)
      .pipe(unzipper.Extract({ path: extractRoot }))
      .promise();

    fs.unlink(file.path, () => {});

    const dbInBackup = path.join(extractRoot, 'database', 'nav.db');
    if (!fs.existsSync(dbInBackup) || !fs.statSync(dbInBackup).isFile()) {
      return res.status(400).json({
        error: '备份文件结构不正确，未在根目录下找到 database/nav.db'
      });
    }

    const dbStats = fs.statSync(dbInBackup);
    if (!dbStats.size) {
      return res.status(400).json({
        error: '备份中的数据库文件为空或已损坏'
      });
    }

    const headerBuf = Buffer.alloc(16);
    const fd = fs.openSync(dbInBackup, 'r');
    fs.readSync(fd, headerBuf, 0, 16, 0);
    fs.closeSync(fd);
    const headerStr = headerBuf.toString('utf8');
    if (!headerStr.startsWith('SQLite format 3')) {
      return res.status(400).json({
        error: '备份中的数据库文件格式不正确'
      });
    }

    const targetDbDir = path.join(__dirname, '../database');
    if (!fs.existsSync(targetDbDir)) {
      fs.mkdirSync(targetDbDir, { recursive: true });
    }
    const targetDbPath = path.join(targetDbDir, 'nav.db');
    fs.copyFileSync(dbInBackup, targetDbPath);

    const uploadsInBackup = path.join(extractRoot, 'uploads');
    const targetUploadsDir = path.join(__dirname, '../uploads');

    if (fs.existsSync(uploadsInBackup) && fs.statSync(uploadsInBackup).isDirectory()) {
      if (fs.existsSync(targetUploadsDir)) {
        fs.rmSync(targetUploadsDir, { recursive: true, force: true });
      }
      fs.cpSync(uploadsInBackup, targetUploadsDir, { recursive: true });
    }

    if (extractRoot && fs.existsSync(extractRoot)) {
      fs.rmSync(extractRoot, { recursive: true, force: true });
    }

    res.json({ message: '恢复成功' });
  } catch (err) {
    console.error('恢复失败:', err);

    try {
      if (extractRoot && fs.existsSync(extractRoot)) {
        fs.rmSync(extractRoot, { recursive: true, force: true });
      }
    } catch (_) {}

    res.status(500).json({ error: '恢复失败' });
  }
});

module.exports = router;
