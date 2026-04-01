<script setup>
import { computed, onMounted, ref, watch } from "vue";

const apiBase = import.meta.env.VITE_API_BASE_URL || "";
const feedbackEmail = import.meta.env.VITE_FEEDBACK_EMAIL || "";
const appVersion = import.meta.env.VITE_APP_VERSION || "v1.0.0";
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
const allPets = ref([]);
const pets = ref([]);
const breedMatches = ref([]);
const selectedPet = ref(null);
const inheritSelectedPet = ref(null);
const inheritDirectResults = ref([]);
const inheritIndirectResults = ref([]);
const inheritTargetPet = ref(null);
const inheritPaths = ref([]);
const requests = ref([]);

const breedSearch = ref("");
const breedGroup = ref("");
const exactPetName = ref("");
const inheritSearch = ref("");
const inheritGroup = ref("");
const inheritPetName = ref("");
const inheritTargetPetName = ref("");
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
const inheritFilteredPets = computed(() =>
  allPets.value.filter((pet) => {
    const matchesSearch = !inheritSearch.value.trim() || pet.name.includes(inheritSearch.value.trim());
    const matchesGroup = !inheritGroup.value.trim() || pet.groups.includes(inheritGroup.value.trim());
    return matchesSearch && matchesGroup;
  })
);
const isUserReady = computed(() => Boolean(userProfile.value.token && userProfile.value.username));
const currentViewTitle = computed(() => {
  if (view.value === "breed") return "蛋组查询";
  if (view.value === "inherit") return "炫彩继承";
  return "求蛋广场";
});
const currentViewDescription = computed(() => {
  if (view.value === "breed") {
    return "蛋随母系，部分宠物属于多个蛋组，因此会在多个组别下被查询到。";
  }
  if (view.value === "inherit") {
    return "选择炫彩起点与目标精灵，按蛋组链路推导可行的继承结果。";
  }
  return "卡片归属到登录用户，支持按用户名查询，并通过完成求蛋保留历史记录。";
});

function imageUrl(petName) {
  return `/pet-img/${petName}.png`;
}

function shareEggGroup(leftPet, rightPet) {
  return leftPet.groups.some((group) => rightPet.groups.includes(group));
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
    allPets.value = petsData.pets;
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

function clearInheritanceSelection() {
  inheritSelectedPet.value = null;
  inheritTargetPet.value = null;
  inheritPaths.value = [];
  inheritDirectResults.value = [];
  inheritIndirectResults.value = [];
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

function buildInheritanceGraph(startPet) {
  const queue = [{ pet: startPet, depth: 0 }];
  const visited = new Map([[startPet.id, 0]]);
  const parentMap = new Map();

  while (queue.length) {
    const current = queue.shift();
    for (const pet of allPets.value) {
      if (visited.has(pet.id)) continue;
      if (!shareEggGroup(current.pet, pet)) continue;
      visited.set(pet.id, current.depth + 1);
      parentMap.set(pet.id, current.pet.id);
      queue.push({ pet, depth: current.depth + 1 });
    }
  }

  const direct = [];
  const indirect = [];

  for (const pet of allPets.value) {
    const depth = visited.get(pet.id);
    if (pet.id === startPet.id || depth === undefined) continue;
    if (depth === 1) {
      direct.push(pet);
    } else {
      indirect.push({ ...pet, inheritDepth: depth });
    }
  }

  return { direct, indirect, parentMap, visited };
}

function buildInheritancePaths(startPet, targetPet, maxPaths = 24) {
  if (!startPet || !targetPet || startPet.id === targetPet.id) {
    return [];
  }

  const reverseGraph = buildInheritanceGraph(targetPet);
  const shortestDepth = reverseGraph.visited.get(startPet.id);
  if (shortestDepth === undefined) {
    return [];
  }

  const maxDepth = Math.min(shortestDepth + 4, allPets.value.length - 1);
  const results = [];
  const stack = [
    {
      path: [startPet],
      visited: new Set([startPet.id])
    }
  ];

  while (stack.length && results.length < maxPaths) {
    const current = stack.pop();
    const lastPet = current.path[current.path.length - 1];
    const depthUsed = current.path.length - 1;

    if (lastPet.id === targetPet.id) {
      results.push([...current.path]);
      continue;
    }

    const neighbors = allPets.value
      .filter((pet) => {
        if (current.visited.has(pet.id)) return false;
        if (!shareEggGroup(lastPet, pet)) return false;
        const remainDepth = reverseGraph.visited.get(pet.id);
        if (remainDepth === undefined) return false;
        return depthUsed + 1 + remainDepth <= maxDepth;
      })
      .sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));

    for (let index = neighbors.length - 1; index >= 0; index -= 1) {
      const pet = neighbors[index];
      stack.push({
        path: [...current.path, pet],
        visited: new Set([...current.visited, pet.id])
      });
    }
  }

  return results.sort((left, right) => {
    if (left.length !== right.length) return left.length - right.length;
    return left.map((pet) => pet.name).join(">").localeCompare(right.map((pet) => pet.name).join(">"), "zh-Hans-CN");
  });
}

function setInheritancePet(pet) {
  inheritSelectedPet.value = pet;
  inheritPetName.value = pet.name;
  inheritTargetPet.value = null;
  inheritTargetPetName.value = "";
  inheritPaths.value = [];
  const result = buildInheritanceGraph(pet);
  inheritDirectResults.value = result.direct;
  inheritIndirectResults.value = result.indirect;
  error.value = "";
  success.value = `已选定起点精灵：${pet.name}，当前可推导 ${result.direct.length + result.indirect.length} 只可继承精灵。`;
}

function selectInheritanceGroup(group) {
  inheritGroup.value = group;
  inheritPetName.value = "";
  clearInheritanceSelection();
}

function searchInheritance() {
  if (!inheritPetName.value.trim()) {
    error.value = "请输入完整宠物名称。";
    return;
  }

  const pet = allPets.value.find((item) => item.name === inheritPetName.value.trim());
  if (!pet) {
    error.value = "没有找到这个宠物。";
    return;
  }

  setInheritancePet(pet);
}

function pickInheritancePet(pet) {
  setInheritancePet(pet);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resolveInheritanceTarget(targetPet) {
  if (!inheritSelectedPet.value) {
    error.value = "请先选择起点精灵。";
    return;
  }

  const result = buildInheritanceGraph(inheritSelectedPet.value);
  const canInherit = result.visited.has(targetPet.id) && targetPet.id !== inheritSelectedPet.value.id;
  inheritDirectResults.value = result.direct;
  inheritIndirectResults.value = result.indirect;
  inheritTargetPet.value = targetPet;

  if (!canInherit) {
    inheritPaths.value = [];
    error.value = `当前起点 ${inheritSelectedPet.value.name} 无法继承到 ${targetPet.name}。`;
    return;
  }

  inheritPaths.value = buildInheritancePaths(inheritSelectedPet.value, targetPet);
  error.value = "";
  success.value = `已推导：${inheritSelectedPet.value.name} 可以继承到 ${targetPet.name}，共找到 ${inheritPaths.value.length} 条路径。`;
}

function searchInheritanceTarget() {
  if (!inheritTargetPetName.value.trim()) {
    error.value = "请输入目标精灵名称。";
    return;
  }

  const pet = allPets.value.find((item) => item.name === inheritTargetPetName.value.trim());
  if (!pet) {
    error.value = "没有找到目标精灵。";
    return;
  }

  resolveInheritanceTarget(pet);
}

function pickInheritanceTarget(pet) {
  inheritTargetPetName.value = pet.name;
  resolveInheritanceTarget(pet);
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

async function copyContactId(contactId) {
  if (!contactId) {
    error.value = "没有可复制的联系 ID。";
    return;
  }

  try {
    await navigator.clipboard.writeText(String(contactId));
    error.value = "";
    success.value = `已复制联系 ID：${contactId}`;
  } catch {
    error.value = "复制失败，请手动复制。";
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
      <h1>洛克王国精灵广场</h1>
    </div>

    <section class="attribution-bar">
      <div class="attribution-links">
      <span>
        蛋组数据来源：
        <a href="https://github.com/MIXHS/txm.github.io" target="_blank" rel="noreferrer">MIXHS/txm.github.io</a>
      </span>
      <span>
        精灵立绘数据来源：
        <a href="https://wiki.biligame.com/rocom/" target="_blank" rel="noreferrer">洛克王国 Wiki</a>
      </span>
      <span>
        遵循开源协议
        <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a>
      </span>
      </div>
      <a v-if="feedbackEmail" class="feedback-mail" :href="`mailto:${feedbackEmail}`">问题邮箱</a>
    </section>

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
            <button class="segmented-tab" :class="{ active: view === 'inherit' }" @click="view = 'inherit'">炫彩继承</button>
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

        <section v-else-if="view === 'inherit'" class="side-card">
          <p class="side-label">选材继承计算</p>
          <div class="field">
            <label>炫彩起点精灵</label>
            <input v-model="inheritPetName" list="pet-names" type="text" placeholder="输入完整起点精灵名称" />
          </div>
          <button class="primary-btn full-btn" @click="searchInheritance">设为起点</button>
          <div class="field">
            <label>目标精灵</label>
            <input v-model="inheritTargetPetName" list="pet-names" type="text" placeholder="输入目标精灵名称" />
          </div>
          <button class="primary-btn full-btn" @click="searchInheritanceTarget">计算继承</button>
          <div class="field">
            <label>起点模糊搜索</label>
            <input v-model="inheritSearch" type="text" placeholder="筛选右侧起点卡片" />
          </div>
          <p class="panel-tip no-margin">右侧卡片点一下会设为起点；如果已经选好起点，再点右侧结果卡片会直接把它作为目标精灵并计算继承路径。</p>
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

        <section v-else-if="view === 'inherit'" class="panel panel-main">
          <div class="chip-row chip-row-top">
            <button class="filter-chip" :class="{ active: inheritGroup === '' }" @click="selectInheritanceGroup('')">全部</button>
            <button v-for="group in eggGroups" :key="`inherit-chip-${group}`" class="filter-chip" :class="{ active: inheritGroup === group }" @click="selectInheritanceGroup(group)">{{ group }}</button>
          </div>

          <div v-if="inheritSelectedPet" class="focus-card">
            <div class="focus-image">
              <img :src="imageUrl(inheritSelectedPet.name)" :alt="inheritSelectedPet.name" @error="$event.target.style.visibility = 'hidden'" />
            </div>
            <div>
              <p class="side-label">当前起点</p>
              <h3>{{ inheritSelectedPet.name }}</h3>
              <p>{{ inheritSelectedPet.groups.join(' / ') }}</p>
              <p v-if="inheritTargetPet" class="inherit-summary">
                目标精灵：<strong>{{ inheritTargetPet.name }}</strong>
              </p>
              <p v-if="inheritPaths.length" class="inherit-summary">
                共找到 <strong>{{ inheritPaths.length }}</strong> 条继承路径
              </p>
            </div>
          </div>

          <div v-if="inheritPaths.length" class="inherit-paths">
            <p class="panel-tip inherit-section-title">继承结果（由短到长）</p>
            <div class="inherit-path-list">
              <article v-for="(path, index) in inheritPaths" :key="`inherit-path-${index}`" class="inherit-path-card">
                <strong>方案 {{ index + 1 }}</strong>
                <span class="inherit-path-text">{{ path.map((pet) => pet.name).join(' -> ') }}</span>
                <span>共经过 {{ path.length - 1 }} 次传递</span>
              </article>
            </div>
          </div>

          <template v-if="inheritDirectResults.length || inheritIndirectResults.length">
            <p v-if="inheritDirectResults.length" class="panel-tip inherit-section-title">直接同组继承</p>
            <div v-if="inheritDirectResults.length" class="card-grid card-grid-small">
              <article v-for="pet in inheritDirectResults" :key="`inherit-direct-${pet.id}`" class="pet-card clickable-card" @click="pickInheritanceTarget(pet)">
                <div class="pet-thumb">
                  <img :src="imageUrl(pet.name)" :alt="pet.name" @error="$event.target.style.visibility = 'hidden'" />
                </div>
                <strong>{{ pet.name }}</strong>
                <span>{{ pet.groups.join(' / ') }}</span>
              </article>
            </div>

            <p v-if="inheritIndirectResults.length" class="panel-tip inherit-section-title">间接继承</p>
            <div v-if="inheritIndirectResults.length" class="card-grid card-grid-small">
              <article v-for="pet in inheritIndirectResults" :key="`inherit-indirect-${pet.id}`" class="pet-card clickable-card" @click="pickInheritanceTarget(pet)">
                <div class="pet-thumb">
                  <img :src="imageUrl(pet.name)" :alt="pet.name" @error="$event.target.style.visibility = 'hidden'" />
                </div>
                <strong>{{ pet.name }}</strong>
                <span>{{ pet.groups.join(' / ') }}</span>
                <span>需经过 {{ pet.inheritDepth - 1 }} 层传递</span>
              </article>
            </div>
          </template>

          <div v-else-if="inheritSelectedPet" class="banner">
            这只精灵当前没有可继续扩散的继承结果。
          </div>

          <div v-else class="card-grid wide-grid">
            <article v-for="pet in inheritFilteredPets" :key="`inherit-pet-${pet.id}`" class="pet-card clickable-card" @click="pickInheritancePet(pet)">
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
            <article v-for="card in requests" :key="card.id" class="request-card clickable-card request-hover-card">
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
                  <dd>
                    <button class="inline-copy-btn" @click="copyContactId(card.userContactId || card.contact_id)">
                      {{ card.userContactId || card.contact_id }}
                    </button>
                  </dd>
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
      <option v-for="pet in allPets" :key="`name-${pet.id}`" :value="pet.name"></option>
    </datalist>

    <footer class="page-footer">
      <span>作者：sheetung</span>
      <span>版本：{{ appVersion }}</span>
      <a href="https://github.com/sheetung/rocom-petpm" target="_blank" rel="noreferrer">开源地址</a>
    </footer>
  </div>
</template>










