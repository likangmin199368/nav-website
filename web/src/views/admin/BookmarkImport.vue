<template>
  <div class="bookmark-import">
    <h2 class="page-title">书签导入</h2>
    <p class="page-desc">上传 Chrome/Firefox 导出的书签 HTML 文件，将书签导入为导航卡片。</p>

    <div class="import-form">
      <!-- 文件上传 -->
      <div class="form-group">
        <label class="form-label">选择书签文件</label>
        <div class="file-upload" :class="{ 'has-file': selectedFile }">
          <input
            type="file"
            ref="fileInput"
            accept=".html,.htm"
            @change="onFileChange"
            class="file-input"
          />
          <div class="file-upload-content">
            <svg v-if="!selectedFile" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2566d8" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span v-if="!selectedFile">点击或拖拽上传 HTML 文件</span>
            <span v-else class="file-name">{{ selectedFile.name }} ({{ formatFileSize(selectedFile.size) }})</span>
          </div>
        </div>
      </div>

      <!-- 导入模式 -->
      <div class="form-group">
        <label class="form-label">导入模式</label>
        <div class="radio-group">
          <label class="radio-item">
            <input type="radio" v-model="importMode" value="merge" />
            <span class="radio-label">合并导入</span>
            <span class="radio-desc">同 URL 书签将跳过，不重复导入</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="importMode" value="replace" />
            <span class="radio-label">替换导入</span>
            <span class="radio-desc">先删除目标范围内的数据，再重新导入</span>
          </label>
        </div>
      </div>

      <!-- 目标栏目 -->
      <div class="form-group">
        <label class="form-label">目标栏目</label>
        <div class="radio-group">
          <label class="radio-item">
            <input type="radio" v-model="targetType" value="auto" />
            <span class="radio-label">自动创建</span>
            <span class="radio-desc">顶层文件夹自动创建为栏目</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="targetType" value="menu" />
            <span class="radio-label">指定栏目</span>
            <span class="radio-desc">所有书签导入到选定栏目</span>
          </label>
        </div>
        <select v-if="targetType === 'menu'" v-model="targetMenuId" class="menu-select">
          <option value="">请选择栏目</option>
          <option v-for="menu in menuList" :key="menu.id" :value="menu.id">
            {{ menu.name }}
          </option>
        </select>
      </div>

      <!-- 操作按钮 -->
      <div class="form-actions">
        <button
          class="btn btn-preview"
          @click="previewImport"
          :disabled="!selectedFile || loading"
        >
          {{ loading && isDryRun ? '预览中...' : '预览导入' }}
        </button>
        <button
          class="btn btn-import"
          @click="executeImport"
          :disabled="!selectedFile || loading || !previewResult"
        >
          {{ loading && !isDryRun ? '导入中...' : '确认导入' }}
        </button>
      </div>
    </div>

    <!-- 预览结果 -->
    <div v-if="previewResult" class="result-panel preview-panel">
      <h3>预览结果</h3>
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-label">将创建栏目</span>
          <span class="stat-value">{{ previewResult.created?.menus || 0 }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">将创建子栏目</span>
          <span class="stat-value">{{ previewResult.created?.subMenus || 0 }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">将创建卡片</span>
          <span class="stat-value">{{ previewResult.created?.cards || 0 }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">将跳过栏目</span>
          <span class="stat-value muted">{{ previewResult.skipped?.menus || 0 }}</span>
        </div>
      </div>
      <div v-if="previewResult.sample?.length" class="sample-list">
        <h4>样本书签</h4>
        <ul>
          <li v-for="(item, idx) in previewResult.sample" :key="idx">
            <span class="sample-title">{{ item.title }}</span>
            <a :href="item.url" target="_blank" class="sample-url">{{ truncateUrl(item.url) }}</a>
          </li>
        </ul>
      </div>
      <div v-if="previewResult.errors?.length" class="error-list">
        <h4>解析提示</h4>
        <ul>
          <li v-for="(err, idx) in previewResult.errors.slice(0, 5)" :key="idx">{{ err }}</li>
          <li v-if="previewResult.errors.length > 5">... 共 {{ previewResult.errors.length }} 条提示</li>
        </ul>
      </div>
    </div>

    <!-- 导入结果 -->
    <div v-if="importResult" class="result-panel import-panel" :class="{ success: importResult.ok }">
      <h3>{{ importResult.ok ? '导入成功' : '导入失败' }}</h3>
      <div v-if="importResult.ok" class="stats-grid">
        <div class="stat-item">
          <span class="stat-label">已创建栏目</span>
          <span class="stat-value success">{{ importResult.created?.menus || 0 }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">已创建子栏目</span>
          <span class="stat-value success">{{ importResult.created?.subMenus || 0 }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">已创建卡片</span>
          <span class="stat-value success">{{ importResult.created?.cards || 0 }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">已跳过卡片</span>
          <span class="stat-value muted">{{ importResult.skipped?.cards || 0 }}</span>
        </div>
      </div>
      <p v-if="importResult.error" class="error-msg">{{ importResult.error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getMenus, importBookmarks } from '../../api';

const fileInput = ref(null);
const selectedFile = ref(null);
const importMode = ref('merge');
const targetType = ref('auto');
const targetMenuId = ref('');
const menuList = ref([]);
const loading = ref(false);
const isDryRun = ref(false);
const previewResult = ref(null);
const importResult = ref(null);

onMounted(async () => {
  try {
    const res = await getMenus();
    menuList.value = res.data || [];
  } catch (e) {
    console.error('Failed to load menus:', e);
  }
});

function onFileChange(e) {
  const file = e.target.files?.[0];
  if (file) {
    selectedFile.value = file;
    previewResult.value = null;
    importResult.value = null;
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function truncateUrl(url) {
  if (url.length > 50) {
    return url.slice(0, 47) + '...';
  }
  return url;
}

async function previewImport() {
  if (!selectedFile.value) return;

  loading.value = true;
  isDryRun.value = true;
  importResult.value = null;

  try {
    const target = targetType.value === 'auto' ? 'auto' : `menu:${targetMenuId.value}`;
    const result = await importBookmarks(selectedFile.value, importMode.value, target, true);
    previewResult.value = result.data;
  } catch (e) {
    previewResult.value = { ok: false, error: e.response?.data?.error || e.message };
  } finally {
    loading.value = false;
    isDryRun.value = false;
  }
}

async function executeImport() {
  if (!selectedFile.value || !previewResult.value) return;

  loading.value = true;
  isDryRun.value = false;

  try {
    const target = targetType.value === 'auto' ? 'auto' : `menu:${targetMenuId.value}`;
    const result = await importBookmarks(selectedFile.value, importMode.value, target, false);
    importResult.value = result.data;

    if (result.data.ok) {
      // 清空表单
      selectedFile.value = null;
      previewResult.value = null;
      if (fileInput.value) {
        fileInput.value.value = '';
      }
      // 刷新菜单列表
      const res = await getMenus();
      menuList.value = res.data || [];
    }
  } catch (e) {
    importResult.value = { ok: false, error: e.response?.data?.error || e.message };
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.bookmark-import {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #222;
  margin-bottom: 8px;
}

.page-desc {
  color: #666;
  margin-bottom: 24px;
}

.import-form {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.form-group {
  margin-bottom: 24px;
}

.form-label {
  display: block;
  font-weight: 500;
  margin-bottom: 8px;
  color: #333;
}

.file-upload {
  position: relative;
  border: 2px dashed #d0d7e2;
  border-radius: 8px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.file-upload:hover {
  border-color: #2566d8;
  background: #f8faff;
}

.file-upload.has-file {
  border-color: #2566d8;
  background: #f0f7ff;
}

.file-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.file-upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #666;
}

.file-name {
  color: #2566d8;
  font-weight: 500;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.radio-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
  padding: 12px;
  border: 1px solid #e3e6ef;
  border-radius: 8px;
  transition: all 0.2s;
}

.radio-item:hover {
  border-color: #2566d8;
}

.radio-item input[type="radio"] {
  margin-top: 2px;
}

.radio-label {
  font-weight: 500;
  color: #333;
}

.radio-desc {
  display: block;
  font-size: 12px;
  color: #888;
  margin-left: auto;
}

.menu-select {
  width: 100%;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid #d0d7e2;
  border-radius: 8px;
  font-size: 14px;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-preview {
  background: #f0f7ff;
  color: #2566d8;
  border: 1px solid #2566d8;
}

.btn-preview:hover:not(:disabled) {
  background: #e0efff;
}

.btn-import {
  background: #2566d8;
  color: #fff;
}

.btn-import:hover:not(:disabled) {
  background: #174ea6;
}

.result-panel {
  margin-top: 24px;
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.result-panel h3 {
  font-size: 1.1rem;
  margin-bottom: 16px;
  color: #333;
}

.result-panel.success h3 {
  color: #1abc9c;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
}

.stat-item {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
  text-align: center;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 600;
  color: #2566d8;
}

.stat-value.success {
  color: #1abc9c;
}

.stat-value.muted {
  color: #999;
}

.sample-list, .error-list {
  margin-top: 20px;
}

.sample-list h4, .error-list h4 {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.sample-list ul, .error-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.sample-list li {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
  font-size: 13px;
}

.sample-title {
  color: #333;
  font-weight: 500;
}

.sample-url {
  color: #2566d8;
  text-decoration: none;
}

.sample-url:hover {
  text-decoration: underline;
}

.error-list li {
  padding: 6px 0;
  font-size: 13px;
  color: #e67e22;
}

.error-msg {
  color: #e74c3c;
  font-weight: 500;
}

@media (max-width: 600px) {
  .bookmark-import {
    padding: 12px;
  }

  .import-form {
    padding: 16px;
  }

  .form-actions {
    flex-direction: column;
  }

  .radio-desc {
    display: block;
    margin-left: 0;
    margin-top: 4px;
  }
}
</style>
