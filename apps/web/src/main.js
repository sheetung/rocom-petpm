import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";

const umamiSrc = import.meta.env.VITE_UMAMI_SRC;
const umamiWebsiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID;

if (umamiSrc && umamiWebsiteId) {
  const script = document.createElement("script");
  script.defer = true;
  script.src = umamiSrc;
  script.setAttribute("data-website-id", umamiWebsiteId);
  document.head.appendChild(script);
}

createApp(App).mount("#app");
