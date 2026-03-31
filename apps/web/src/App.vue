<script setup>
import { computed, onMounted, ref } from "vue";

const apiBase = import.meta.env.VITE_API_BASE_URL || "";
const view = ref("breed");
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const success = ref("");

const eggGroups = ref([]);
const pets = ref([]);
const breedMatches = ref([]);
const selectedPet = ref(null);
const requests = ref([]);

const breedSearch = ref("");
const breedGroup = ref("");
const exactPetName = ref("");
const requestKeyword = ref("");
const requestWantedPet = ref("");

const form = ref({
  wantedPet: "",
  offeredPet: "",
  contactId: "",
  note: ""
});

const filteredPets = computed(() => pets.value);

function imageUrl(petName) {
  return `/pet-img/${petName}.PNG`;
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Request failed: ${response.status}`);
  }

  return response.json();
}

async function loadInitial() {
  loading.value = true;
  error.value = "";
  try {
    const [groupsData, petsData, requestsData] = await Promise.all([
      fetchJson("/api/egg-groups"),
      fetchJson("/api/pets"),
      fetchJson("/api/requests")
    ]);
    eggGroups.value = groupsData.groups;
    pets.value = petsData.pets;
    requests.value = requestsData.requests;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function refreshPets() {
  loading.value = true;
  error.value = "";
  try {
    const params = new URLSearchParams();
    if (breedSearch.value.trim()) params.set("search", breedSearch.value.trim());
    if (breedGroup.value.trim()) params.set("group", breedGroup.value.trim());
    const data = await fetchJson(`/api/pets?${params.toString()}`);
    pets.value = data.pets;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function searchMatches() {
  if (!exactPetName.value.trim()) {
    error.value = "请输入完整宠物名称。";
    return;
  }

  error.value = "";
  const params = new URLSearchParams({ petName: exactPetName.value.trim() });
  try {
    const data = await fetchJson(`/api/breed/matches?${params.toString()}`);
    selectedPet.value = data.pet;
    breedMatches.value = data.matches;
    if (!data.pet) {
      error.value = "没有找到这个宠物。";
    }
  } catch (err) {
    error.value = err.message;
  }
}

async function pickPet(pet) {
  exactPetName.value = pet.name;
  await searchMatches();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function refreshRequests() {
  loading.value = true;
  error.value = "";
  try {
    const params = new URLSearchParams();
    if (requestKeyword.value.trim()) params.set("keyword", requestKeyword.value.trim());
    if (requestWantedPet.value.trim()) params.set("wantedPet", requestWantedPet.value.trim());
    const data = await fetchJson(`/api/requests?${params.toString()}`);
    requests.value = data.requests;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function createRequestCard() {
  if (!form.value.wantedPet.trim() || !form.value.contactId.trim()) {
    error.value = "想要的宠物蛋和联系 ID 为必填。";
    return;
  }

  saving.value = true;
  error.value = "";
  success.value = "";
  try {
    await fetchJson("/api/requests", {
      method: "POST",
      body: JSON.stringify({
        wantedPet: form.value.wantedPet.trim(),
        offeredPet: form.value.offeredPet.trim(),
        contactId: form.value.contactId.trim(),
        note: form.value.note.trim()
      })
    });
    success.value = "求蛋卡片已发布。";
    form.value = { wantedPet: "", offeredPet: "", contactId: "", note: "" };
    await refreshRequests();
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}

onMounted(loadInitial);
</script>

<template>
  <div class="page-shell">
    <div class="hero">
      <p class="eyebrow">Rocom Petplus Node</p>
      <h1>洛克王国蛋组查询与求蛋广场</h1>
      <p class="hero-text">基于 Vue + Node + SQLite，适合部署到 1Panel。前端负责体验，后端负责真实存储与检索。</p>
      <div class="segmented-tabs" role="tablist" aria-label="功能切换">
        <button class="segmented-tab" :class="{ active: view === 'breed' }" @click="view = 'breed'">蛋组查询</button>
        <button class="segmented-tab" :class="{ active: view === 'board' }" @click="view = 'board'">求蛋广场</button>
      </div>
    </div>

    <p v-if="error" class="banner banner-error">{{ error }}</p>
    <p v-if="success" class="banner banner-success">{{ success }}</p>
    <p v-if="loading" class="banner">正在加载数据...</p>

    <section v-if="view === 'breed'" class="panel">
      <div class="panel-head">
        <h2>蛋组查询</h2>
        <p>筛选宠物、查可配对对象，继续保留你原来的核心功能。</p>
      </div>

      <div class="toolbar">
        <div class="field grow">
          <label>名称模糊搜索</label>
          <input v-model="breedSearch" type="text" placeholder="输入宠物名称片段" />
        </div>
        <div class="field">
          <label>蛋组筛选</label>
          <select v-model="breedGroup">
            <option value="">全部</option>
            <option v-for="group in eggGroups" :key="group" :value="group">{{ group }}</option>
          </select>
        </div>
        <button class="primary-btn" @click="refreshPets">更新列表</button>
      </div>

      <div class="toolbar toolbar-secondary">
        <div class="field grow">
          <label>精确查询配对</label>
          <input v-model="exactPetName" list="pet-names" type="text" placeholder="输入完整宠物名称" />
        </div>
        <button class="primary-btn" @click="searchMatches">查询配对</button>
      </div>

      <div v-if="selectedPet" class="focus-card">
        <div class="focus-image">
          <img :src="imageUrl(selectedPet.name)" :alt="selectedPet.name" @error="$event.target.style.visibility = 'hidden'" />
        </div>
        <div>
          <h3>{{ selectedPet.name }}</h3>
          <p>{{ selectedPet.groups.join(' / ') }}</p>
        </div>
      </div>

      <div v-if="breedMatches.length" class="card-grid card-grid-small">
        <article v-for="pet in breedMatches" :key="`match-${pet.id}`" class="pet-card clickable-card" @click="pickPet(pet)">
          <div class="pet-thumb">
            <img :src="imageUrl(pet.name)" :alt="pet.name" @error="$event.target.style.visibility = 'hidden'" />
          </div>
          <strong>{{ pet.name }}</strong>
          <span>{{ pet.groups.join(' / ') }}</span>
        </article>
      </div>

      <div class="chip-row">
        <button class="filter-chip" :class="{ active: breedGroup === '' }" @click="breedGroup = ''; refreshPets()">全部</button>
        <button v-for="group in eggGroups" :key="`chip-${group}`" class="filter-chip" :class="{ active: breedGroup === group }" @click="breedGroup = group; refreshPets()">{{ group }}</button>
      </div>

      <p class="panel-tip">下方卡片现在支持直接点击，点一下就会自动查询这只宠物的配对结果。</p>

      <div class="card-grid">
        <article v-for="pet in filteredPets" :key="pet.id" class="pet-card clickable-card" @click="pickPet(pet)">
          <div class="pet-thumb">
            <img :src="imageUrl(pet.name)" :alt="pet.name" @error="$event.target.style.visibility = 'hidden'" />
          </div>
          <strong>{{ pet.name }}</strong>
          <span>{{ pet.groups.join(' / ') }}</span>
        </article>
      </div>
    </section>

    <section v-else class="panel">
      <div class="panel-head">
        <h2>求蛋广场</h2>
        <p>支持用户发布想要的宠物蛋、可提供内容和联系 ID，后端会把数据存到 SQLite。</p>
      </div>

      <div class="publish-grid">
        <div class="field">
          <label>想要的宠物蛋</label>
          <input v-model="form.wantedPet" list="pet-names" type="text" placeholder="必填" />
        </div>
        <div class="field">
          <label>可提供的宠物</label>
          <input v-model="form.offeredPet" list="pet-names" type="text" placeholder="选填" />
        </div>
        <div class="field">
          <label>联系 ID</label>
          <input v-model="form.contactId" type="text" placeholder="必填" />
        </div>
        <div class="field field-full">
          <label>补充说明</label>
          <textarea v-model="form.note" rows="3" placeholder="选填"></textarea>
        </div>
        <button class="primary-btn" :disabled="saving" @click="createRequestCard">{{ saving ? '发布中...' : '发布求蛋卡片' }}</button>
      </div>

      <div class="toolbar toolbar-secondary">
        <div class="field grow">
          <label>广场关键词</label>
          <input v-model="requestKeyword" type="text" placeholder="搜宠物、提供内容、ID" />
        </div>
        <div class="field">
          <label>按想要的蛋筛选</label>
          <input v-model="requestWantedPet" list="pet-names" type="text" placeholder="选填" />
        </div>
        <button class="primary-btn" @click="refreshRequests">检索广场</button>
      </div>

      <div class="board-grid">
        <article v-for="card in requests" :key="card.id" class="request-card">
          <div class="request-top">
            <span class="badge">求蛋中</span>
            <time>{{ card.created_at }}</time>
          </div>
          <h3>{{ card.wanted_pet }}</h3>
          <dl class="request-meta">
            <div>
              <dt>可提供</dt>
              <dd>{{ card.offered_pet || '暂未填写' }}</dd>
            </div>
            <div>
              <dt>联系 ID</dt>
              <dd>{{ card.contact_id }}</dd>
            </div>
          </dl>
          <p v-if="card.note" class="request-note">{{ card.note }}</p>
        </article>
      </div>
    </section>

    <datalist id="pet-names">
      <option v-for="pet in pets" :key="`name-${pet.id}`" :value="pet.name"></option>
    </datalist>
  </div>
</template>
