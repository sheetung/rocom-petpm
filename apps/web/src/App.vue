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
const currentViewTitle = computed(() => (view.value === "breed" ? "�����ѯ" : "�󵰹㳡"));
const currentViewDescription = computed(() =>
  view.value === "breed"
    ? "ɸѡ��������Զ��󣬼�������ԭ���ĺ��Ĳ�ѯ���顣"
    : "��Ƭ�������¼�û���֧�ְ��û�����ѯ����ͨ������󵰱�����ʷ��¼��"
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
  success.value = "���˳���ǰ��¼��";
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
    error.value = "�û���������Ϊ���";
    return;
  }
  if (authMode.value === "register" && !authForm.value.contactId.trim()) {
    error.value = "ע��ʱ��Ҫ��д��ϵ ID��";
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
    success.value = authMode.value === "login" ? "��¼�ɹ���" : "ע�Ტ��¼�ɹ���";
    await refreshRequests();
  } catch (err) {
    error.value = err.message;
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
    error.value = "�����������������ơ�";
    return;
  }

  error.value = "";
  const params = new URLSearchParams({ petName: exactPetName.value.trim() });
  try {
    const data = await fetchJson(`/api/breed/matches?${params.toString()}`);
    selectedPet.value = data.pet;
    breedMatches.value = data.matches;
    if (!data.pet) {
      error.value = "û���ҵ�������";
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
    error.value = "���ȵ�¼���ٷ�����Ƭ��";
    showUserModal.value = true;
    return;
  }
  if (!form.value.wantedPet.trim()) {
    error.value = "��Ҫ�ĳ��ﵰΪ���";
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
    success.value = "�󵰿�Ƭ�ѷ�����";
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
    error.value = "���ȵ�¼��";
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
    success.value = "�ÿ�Ƭ�ѱ��Ϊ����󵰡�";
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
      <h1>������������ѯ���󵰹㳡</h1>
    </div>

    <p v-if="error" class="banner banner-error">{{ error }}</p>
    <p v-if="success" class="banner banner-success">{{ success }}</p>
    <p v-if="loading" class="banner">���ڼ�������...</p>

    <div class="workspace-grid">
      <aside class="side-panel">
        <section class="side-card">
          <p class="side-label">��ǰģʽ</p>
          <h2>{{ currentViewTitle }}</h2>
          <p class="side-copy">{{ currentViewDescription }}</p>
          <div class="segmented-tabs stacked-tabs" role="tablist" aria-label="�����л�">
            <button class="segmented-tab" :class="{ active: view === 'breed' }" @click="view = 'breed'">�����ѯ</button>
            <button class="segmented-tab" :class="{ active: view === 'board' }" @click="view = 'board'">�󵰹㳡</button>
          </div>
        </section>

        <section class="side-card user-card">
          <div class="side-head">
            <div>
              <p class="side-label">�û���¼</p>
              <h3>{{ isUserReady ? userProfile.username : 'δ��¼' }}</h3>
            </div>
            <div class="user-actions">
              <button class="ghost-btn" @click="showUserModal = true">{{ isUserReady ? '�л��˺�' : '��¼ / ע��' }}</button>
              <button v-if="isUserReady" class="ghost-btn" @click="logout">�˳�</button>
            </div>
          </div>
          <p class="side-copy small-copy">��¼��ɷ����Լ��Ŀ�Ƭ����ѯ�Լ��ļ�¼��������Ƭ���Ϊ����󵰡�</p>
          <dl v-if="isUserReady" class="user-meta">
            <div>
              <dt>�û���</dt>
              <dd>{{ userProfile.username }}</dd>
            </div>
            <div>
              <dt>��ϵ ID</dt>
              <dd>{{ userProfile.contactId }}</dd>
            </div>
          </dl>
        </section>

        <section v-if="view === 'breed'" class="side-card">
          <p class="side-label">��ѯ����</p>
          <div class="field">
            <label>����ģ������</label>
            <input v-model="breedSearch" type="text" placeholder="�����������Ƭ��" />
          </div>
          <div class="field">
            <label>����ɸѡ</label>
            <select v-model="breedGroup">
              <option value="">ȫ��</option>
              <option v-for="group in eggGroups" :key="group" :value="group">{{ group }}</option>
            </select>
          </div>
          <button class="primary-btn full-btn" @click="refreshPets">�����б�</button>
          <div class="field">
            <label>��ȷ��ѯ���</label>
            <input v-model="exactPetName" list="pet-names" type="text" placeholder="����������������" />
          </div>
          <button class="primary-btn full-btn" @click="searchMatches">��ѯ���</button>
          <p class="panel-tip no-margin">�Ҳ࿨Ƭ֧��ֱ�ӵ������һ�¾ͻ��Զ���ѯ��ֻ�������Խ����</p>
        </section>

        <section v-else class="side-card">
          <p class="side-label">������</p>
          <div class="field">
            <label>��Ҫ�ĳ��ﵰ</label>
            <input v-model="form.wantedPet" list="pet-names" type="text" placeholder="����" />
          </div>
          <div class="field">
            <label>���ṩ�ĳ���</label>
            <input v-model="form.offeredPet" list="pet-names" type="text" placeholder="ѡ��" />
          </div>
          <div class="field">
            <label>����˵��</label>
            <textarea v-model="form.note" rows="4" placeholder="ѡ��"></textarea>
          </div>
          <button class="primary-btn full-btn" :disabled="saving" @click="createRequestCard">{{ saving ? '������...' : '�����󵰿�Ƭ' }}</button>

          <p class="side-label top-gap">�㳡ɸѡ</p>
          <div class="field">
            <label>�ؼ���</label>
            <input v-model="requestKeyword" type="text" placeholder="�ѳ��ID���û���" />
          </div>
          <div class="field">
            <label>��Ҫ�ĵ�</label>
            <input v-model="requestWantedPet" list="pet-names" type="text" placeholder="ѡ��" />
          </div>
          <div class="field">
            <label>�û���</label>
            <input v-model="requestUsername" type="text" placeholder="���Լ��Ŀ�Ƭ" />
          </div>
          <div class="field">
            <label>״̬</label>
            <select v-model="requestStatus">
              <option value="open">����</option>
              <option value="completed">�����</option>
              <option value="all">ȫ��</option>
            </select>
          </div>
          <button class="primary-btn full-btn" @click="refreshRequests">�����㳡</button>
        </section>
      </aside>

      <main class="content-panel">
        <section v-if="view === 'breed'" class="panel panel-main">
          <div class="chip-row chip-row-top">
            <button class="filter-chip" :class="{ active: breedGroup === '' }" @click="breedGroup = ''; refreshPets()">ȫ��</button>
            <button v-for="group in eggGroups" :key="`chip-${group}`" class="filter-chip" :class="{ active: breedGroup === group }" @click="breedGroup = group; refreshPets()">{{ group }}</button>
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


          <div class="card-grid wide-grid">
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
          <div class="board-grid wide-board-grid">
            <article v-for="card in requests" :key="card.id" class="request-card">
              <div class="request-top">
                <span class="badge" :class="{ 'badge-muted': card.status === 'completed' }">{{ card.status === 'completed' ? '�����' : '����' }}</span>
                <time>{{ card.completed_at || card.created_at }}</time>
              </div>
              <h3>{{ card.wanted_pet }}</h3>
              <dl class="request-meta">
                <div>
                  <dt>���ṩ</dt>
                  <dd>{{ card.offered_pet || '��δ��д' }}</dd>
                </div>
                <div>
                  <dt>��ϵ ID</dt>
                  <dd>{{ card.userContactId || card.contact_id }}</dd>
                </div>
                <div>
                  <dt>����˵��</dt>
                  <dd class="request-note-value">{{ card.note || '��δ��д' }}</dd>
                </div>
              </dl>
              <button v-if="card.status === 'open' && isUserReady && card.username === userProfile.username" class="ghost-btn danger-btn" :disabled="completingId === card.id" @click="completeRequestCard(card)">
                {{ completingId === card.id ? '������...' : '�����' }}
              </button>
            </article>
          </div>
        </section>
      </main>
    </div>

    <div v-if="showUserModal" class="modal-backdrop" @click.self="showUserModal = false">
      <div class="modal-card">
        <div class="modal-head">
          <div>
            <p class="side-label">�û���¼</p>
            <h3>{{ authMode === 'login' ? '��¼�˺�' : 'ע���˺�' }}</h3>
          </div>
          <button class="ghost-btn" @click="showUserModal = false">�ر�</button>
        </div>
        <div class="auth-switch">
          <button class="filter-chip" :class="{ active: authMode === 'login' }" @click="authMode = 'login'">��¼</button>
          <button class="filter-chip" :class="{ active: authMode === 'register' }" @click="authMode = 'register'">ע��</button>
        </div>
        <div class="field">
          <label>�û���</label>
          <input v-model="authForm.username" type="text" placeholder="Ψһ�û���" />
        </div>
        <div class="field">
          <label>����</label>
          <input v-model="authForm.password" type="password" placeholder="��������" />
        </div>
        <div v-if="authMode === 'register'" class="field">
          <label>��ϵ ID</label>
          <input v-model="authForm.contactId" type="text" placeholder="QQ / ΢�� / ��Ϸ ID" />
        </div>
        <button class="primary-btn full-btn" @click="submitAuth">{{ authMode === 'login' ? '��¼��ʹ��' : 'ע�Ტ��¼' }}</button>
      </div>
    </div>

    <datalist id="pet-names">
      <option v-for="pet in pets" :key="`name-${pet.id}`" :value="pet.name"></option>
    </datalist>
  </div>
</template>



