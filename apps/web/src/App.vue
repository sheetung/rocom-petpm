<script setup>
import { computed, onMounted, ref, watch } from "vue";

const apiBase = import.meta.env.VITE_API_BASE_URL || "";
const view = ref("breed");
const loading = ref(false);
const saving = ref(false);
const completingId = ref(null);
const error = ref("");
const success = ref("");
const showUserModal = ref(false);
const showRequestModal = ref(false);
const authMode = ref("login");

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
const requestUsername = ref("");
const requestStatus = ref("open");

const userProfile = ref({
  token: "",
  username: "",
  contactId: ""
});

const authForm = ref({
  username: "",
  password: "",
  contactId: ""
});

const form = ref({
  wantedPet: "",
  offeredPet: "",
  note: ""
});

const filteredPets = computed(() => pets.value);
const isUserReady = computed(() => Boolean(userProfile.value.token && userProfile.value.username));
const currentViewTitle = computed(() => (view.value === "breed" ? "蛋组查询" : "求蛋广场"));
const currentViewDescription = computed(() =>
  view.value === "breed"
    ? "筛选宠物、查可配对对象，继续保留原来的核心查询体验。"
    : "卡片归属到登录用户，支持按用户名查询，并通过完成求蛋保留历史记录。"
);

function imageUrl(petName) {
  return `/pet-img/${petName}.PNG`;
}

function loadUserProfile() {
  try {
    const saved = window.localStorage.getItem("rocom-auth-profile");
    if (!saved) return;
    const parsed = JSON.parse(saved);
    userProfile.value.token = parsed.token || "";
    userProfile.value.username = parsed.username || "";
    userProfile.value.contactId = parsed.contactId || "";
    requestUsername.value = parsed.username || "";
  } catch {
    // ignore corrupted local storage
  }
}

function persistUserProfile(payload) {
  userProfile.value = {
    token: payload.token,
    username: payload.user.username,
    contactId: payload.user.contactId
  };
  requestUsername.value = payload.user.username;
  window.localStorage.setItem("rocom-auth-profile", JSON.stringify(userProfile.value));
}

function logout() {
  userProfile.value = { token: "", username: "", contactId: "" };
  window.localStorage.removeItem("rocom-auth-profile");
  requestUsername.value = "";
  success.value = "已退出当前登录。";
}

async function fetchJson(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (userProfile.value.token) {
    headers.Authorization = `Bearer ${userProfile.value.token}`;
  }
  const response = await fetch(`${apiBase}${path}`, { ...options, headers });

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
    if (userProfile.value.token) {
      const auth = await fetchJson("/api/auth/me");
      userProfile.value.username = auth.user.username;
      userProfile.value.contactId = auth.user.contactId;
      requestUsername.value = auth.user.username;
      window.localStorage.setItem("rocom-auth-profile", JSON.stringify(userProfile.value));
    }
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function submitAuth() {
  if (!authForm.value.username.trim() || !authForm.value.password.trim()) {
    error.value = "用户名和密码为必填。";
    return;
  }
  if (authMode.value === "register" && !authForm.value.contactId.trim()) {
    error.value = "注册时需要填写联系 ID。";
    return;
  }

  try {
    const path = authMode.value === "login" ? "/api/auth/login" : "/api/auth/register";
    const payload = {
      username: authForm.value.username.trim(),
      password: authForm.value.password.trim(),
      contactId: authForm.value.contactId.trim()
    };
    const data = await fetchJson(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    persistUserProfile(data);
    authForm.value.password = "";
    showUserModal.value = false;
    success.value = authMode.value === "login" ? "登录成功。" : "注册并登录成功。";
    await refreshRequests();
  } catch (err) {
    error.value = err.message;
  }
}

function clearBreedSelection() {
  selectedPet.value = null;
  breedMatches.value = [];
}

async function refreshPets(groupOverride = breedGroup.value) {
  loading.value = true;
  error.value = "";
  clearBreedSelection();
  exactPetName.value = "";
  breedGroup.value = groupOverride;
  try {
    const params = new URLSearchParams();
    if (breedSearch.value.trim()) params.set("search", breedSearch.value.trim());
    if (groupOverride.trim()) params.set("group", groupOverride.trim());
    const data = await fetchJson(`/api/pets?${params.toString()}`);
    pets.value = data.pets;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

function selectBreedGroup(group) {
  refreshPets(group);
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
    if (requestUsername.value.trim()) params.set("username", requestUsername.value.trim());
    if (requestStatus.value.trim()) params.set("status", requestStatus.value.trim());
    const data = await fetchJson(`/api/requests?${params.toString()}`);
    requests.value = data.requests;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function createRequestCard() {
  if (!isUserReady.value) {
    error.value = "请先登录，再发布卡片。";
    showUserModal.value = true;
    return;
  }
  if (!form.value.wantedPet.trim()) {
    error.value = "想要的宠物蛋为必填。";
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
        note: form.value.note.trim()
      })
    });
    success.value = "求蛋卡片已发布。";
    showRequestModal.value = false;
    form.value = { wantedPet: "", offeredPet: "", note: "" };
    requestUsername.value = userProfile.value.username;
    await refreshRequests();
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function completeRequestCard(card) {
  if (!isUserReady.value) {
    error.value = "请先登录。";
    showUserModal.value = true;
    return;
  }

  completingId.value = card.id;
  error.value = "";
  success.value = "";
  try {
    await fetchJson(`/api/requests/${card.id}/complete`, {
      method: "PATCH"
    });
    success.value = "该卡片已标记为完成求蛋。";
    requestUsername.value = userProfile.value.username;
    await refreshRequests();
  } catch (err) {
    error.value = err.message;
  } finally {
    completingId.value = null;
  }
}

watch(view, () => {
  error.value = "";
  success.value = "";
});

onMounted(() => {
  loadUserProfile();
  loadInitial();
});
</script>

<template>
  <div class="page-shell">
    <div class="hero hero-compact">
      <p class="eyebrow">Rocom Petplus Node</p>
      <h1>洛克王国蛋组查询与求蛋广场</h1>
    </div>

    <p v-if="error" class="banner banner-error">{{ error }}</p>
    <p v-if="success" class="banner banner-success">{{ success }}</p>
    <p v-if="loading" class="banner">正在加载数据...</p>

    <div class="workspace-grid">
      <aside class="side-panel">
        <section class="side-card">
          <p class="side-label">当前模式</p>
          <h2>{{ currentViewTitle }}</h2>
          <p class="side-copy">{{ currentViewDescription }}</p>
          <div class="segmented-tabs stacked-tabs" role="tablist" aria-label="功能切换">
            <button class="segmented-tab" :class="{ active: view === 'breed' }" @click="view = 'breed'">蛋组查询</button>
            <button class="segmented-tab" :class="{ active: view === 'board' }" @click="view = 'board'">求蛋广场</button>
          </div>
        </section>

        <section class="side-card user-card">
          <div class="side-head">
            <div>
              <p class="side-label">用户登录</p>
              <h3>{{ isUserReady ? userProfile.username : '未登录' }}</h3>
            </div>
            <div class="user-actions">
              <button class="ghost-btn" @click="showUserModal = true">{{ isUserReady ? '切换账号' : '登录 / 注册' }}</button>
              <button v-if="isUserReady" class="ghost-btn" @click="logout">退出</button>
            </div>
          </div>
          <p class="side-copy small-copy">登录后可发布自己的卡片、查询自己的记录，并将卡片标记为完成求蛋。</p>
          <dl v-if="isUserReady" class="user-meta">
            <div>
              <dt>用户名</dt>
              <dd>{{ userProfile.username }}</dd>
            </div>
            <div>
              <dt>联系 ID</dt>
              <dd>{{ userProfile.contactId }}</dd>
            </div>
          </dl>
        </section>

        <section v-if="view === 'breed'" class="side-card">
          <p class="side-label">查询操作</p>
          <div class="field">
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
          <button class="primary-btn full-btn" @click="refreshPets">更新列表</button>
          <div class="field">
            <label>精确查询配对</label>
            <input v-model="exactPetName" list="pet-names" type="text" placeholder="输入完整宠物名称" />
          </div>
          <button class="primary-btn full-btn" @click="searchMatches">查询配对</button>
          <p class="panel-tip no-margin">右侧卡片支持直接点击，点一下就会自动查询这只宠物的配对结果。</p>
        </section>

        <section v-else class="side-card">
          <p class="side-label">广场筛选</p>

          <div class="field">
            <label>关键词</label>
            <input v-model="requestKeyword" type="text" placeholder="搜宠物、ID、用户名" />
          </div>
          <div class="field">
            <label>想要的蛋</label>
            <input v-model="requestWantedPet" list="pet-names" type="text" placeholder="选填" />
          </div>
          <div class="field">
            <label>用户名</label>
            <input v-model="requestUsername" type="text" placeholder="查自己的卡片" />
          </div>
          <div class="field">
            <label>状态</label>
            <select v-model="requestStatus">
              <option value="open">求蛋中</option>
              <option value="completed">已完成</option>
              <option value="all">全部</option>
            </select>
          </div>
          <button class="primary-btn full-btn" @click="refreshRequests">检索广场</button>
        </section>
      </aside>

      <main class="content-panel">
        <section v-if="view === 'breed'" class="panel panel-main">
          <div class="chip-row chip-row-top">
            <button class="filter-chip" :class="{ active: breedGroup === '' }" @click="selectBreedGroup('')">全部</button>
            <button v-for="group in eggGroups" :key="`chip-${group}`" class="filter-chip" :class="{ active: breedGroup === group }" @click="selectBreedGroup(group)">{{ group }}</button>
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

          <div v-else class="card-grid wide-grid">
            <article v-for="pet in filteredPets" :key="pet.id" class="pet-card clickable-card" @click="pickPet(pet)">
              <div class="pet-thumb">
                <img :src="imageUrl(pet.name)" :alt="pet.name" @error="$event.target.style.visibility = 'hidden'" />
              </div>
              <strong>{{ pet.name }}</strong>
              <span>{{ pet.groups.join(' / ') }}</span>
            </article>
          </div>
        </section>

        <section v-else class="panel panel-main">
          <div class="panel-head panel-head-row">
            <div>
              <p class="side-label">求蛋广场</p>
              <h2>求蛋广场</h2>
              <p class="panel-tip">浏览卡片、检索记录，需要时再打开发布弹窗。</p>
            </div>
            <button class="primary-btn" @click="showRequestModal = true">发布求蛋卡片</button>
          </div>
          <div class="board-grid wide-board-grid">
            <article v-for="card in requests" :key="card.id" class="request-card">
              <div class="request-top">
                <span class="badge" :class="{ 'badge-muted': card.status === 'completed' }">{{ card.status === 'completed' ? '已完成' : '求蛋中' }}</span>
                <time>{{ card.completed_at || card.created_at }}</time>
              </div>
              <h3>{{ card.wanted_pet }}</h3>
              <dl class="request-meta">
                <div>
                  <dt>可提供</dt>
                  <dd>{{ card.offered_pet || '暂未填写' }}</dd>
                </div>
                <div>
                  <dt>联系 ID</dt>
                  <dd>{{ card.userContactId || card.contact_id }}</dd>
                </div>
                <div>
                  <dt>用户名</dt>
                  <dd>{{ card.username || '未绑定' }}</dd>
                </div>
              </dl>
              <p v-if="card.note" class="request-note">{{ card.note }}</p>
              <button v-if="card.status === 'open' && isUserReady && card.username === userProfile.username" class="ghost-btn danger-btn" :disabled="completingId === card.id" @click="completeRequestCard(card)">
                {{ completingId === card.id ? '处理中...' : '完成求蛋' }}
              </button>
            </article>
          </div>
        </section>
      </main>
    </div>

    <div v-if="showRequestModal" class="modal-backdrop" @click.self="showRequestModal = false">
      <div class="modal-card">
        <div class="modal-head">
          <div>
            <p class="side-label">发布求蛋</p>
            <h3>填写求蛋卡片</h3>
          </div>
          <button class="ghost-btn" @click="showRequestModal = false">关闭</button>
        </div>
        <div class="field">
          <label>想要的宠物蛋</label>
          <input v-model="form.wantedPet" list="pet-names" type="text" placeholder="必填" />
        </div>
        <div class="field">
          <label>可提供的宠物</label>
          <input v-model="form.offeredPet" list="pet-names" type="text" placeholder="选填" />
        </div>
        <div class="field">
          <label>补充说明</label>
          <textarea v-model="form.note" rows="4" placeholder="选填"></textarea>
        </div>
        <button class="primary-btn full-btn" :disabled="saving" @click="createRequestCard">{{ saving ? '发布中...' : '发布求蛋卡片' }}</button>
      </div>
    </div>
    <div v-if="showUserModal" class="modal-backdrop" @click.self="showUserModal = false">
      <div class="modal-card">
        <div class="modal-head">
          <div>
            <p class="side-label">用户登录</p>
            <h3>{{ authMode === 'login' ? '登录账号' : '注册账号' }}</h3>
          </div>
          <button class="ghost-btn" @click="showUserModal = false">关闭</button>
        </div>
        <div class="auth-switch">
          <button class="filter-chip" :class="{ active: authMode === 'login' }" @click="authMode = 'login'">登录</button>
          <button class="filter-chip" :class="{ active: authMode === 'register' }" @click="authMode = 'register'">注册</button>
        </div>
        <div class="field">
          <label>用户名</label>
          <input v-model="authForm.username" type="text" placeholder="唯一用户名" />
        </div>
        <div class="field">
          <label>密码</label>
          <input v-model="authForm.password" type="password" placeholder="输入密码" />
        </div>
        <div v-if="authMode === 'register'" class="field">
          <label>联系 ID</label>
          <input v-model="authForm.contactId" type="text" placeholder="QQ / 微信 / 游戏 ID" />
        </div>
        <button class="primary-btn full-btn" @click="submitAuth">{{ authMode === 'login' ? '登录并使用' : '注册并登录' }}</button>
      </div>
    </div>

    <datalist id="pet-names">
      <option v-for="pet in pets" :key="`name-${pet.id}`" :value="pet.name"></option>
    </datalist>
  </div>
</template>








