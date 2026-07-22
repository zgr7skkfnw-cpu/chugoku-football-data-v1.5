import { createIcon } from "./icons.js";

export function element(tagName, options = {}, children = []) {
  const node = document.createElement(tagName);

  if (options.className) {
    node.className = options.className;
  }

  if (options.text !== undefined) {
    node.textContent = options.text;
  }

  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    node.setAttribute(name, value);
  }

  const normalizedChildren = Array.isArray(children) ? children : [children];
  node.append(...normalizedChildren.filter(Boolean));
  return node;
}

export function createPageHeader({ eyebrow, title, description, badge = "2026" }) {
  const copy = element("div", {}, [
    element("p", { className: "page-eyebrow", text: eyebrow }),
    element("h1", { className: "page-title", text: title }),
    element("p", { className: "page-description", text: description }),
  ]);

  return element("header", { className: "page-header" }, [
    copy,
    element("span", { className: "preview-pill", text: badge }),
  ]);
}

export function createPanel(title, body, meta = "2026") {
  const metaView = meta?.nodeType
    ? meta
    : element("span", { className: "panel__meta", text: meta });
  return element("section", { className: "panel" }, [
    element("header", { className: "panel__header" }, [
      element("h2", { className: "panel__title", text: title }),
      metaView,
    ]),
    body,
  ]);
}

export function createCrest(label, color = "#344352", className = "") {
  const crest = element("span", {
    className: `crest${className ? ` ${className}` : ""}`,
    text: label,
    attributes: { "aria-hidden": "true" },
  });
  crest.style.setProperty("--crest-color", color);
  return crest;
}

export function resolveAssetUrl(path) {
  if (!path) return "";
  return new URL(path.startsWith("/") ? path.slice(1) : path, document.baseURI).href;
}

export function createTeamImage({
  src,
  alt,
  className,
  loading = "lazy",
  width,
  height,
}) {
  return element("img", {
    className,
    attributes: {
      src: resolveAssetUrl(src),
      alt,
      loading,
      decoding: "async",
      ...(width ? { width: String(width) } : {}),
      ...(height ? { height: String(height) } : {}),
    },
  });
}

export function createTeamEmblem(team, className = "team-emblem") {
  if (!team?.emblem) {
    return createCrest(team?.shortName ?? "–", team?.colors?.primary, className);
  }
  const image = createTeamImage({
    src: team.emblem,
    alt: `${team.name} エンブレム`,
    className,
    width: 48,
    height: 48,
  });
  image.addEventListener("error", () => {
    image.replaceWith(createCrest(team?.shortName ?? team?.name?.slice(0, 2) ?? "–", team?.colors?.primary ?? team?.primaryColor, className));
  }, { once: true });
  return image;
}

export function createKitImage(team, type = "home", className = "kit-icon") {
  const src = team?.kits?.[type];
  if (!src) return null;
  return createTeamImage({
    src,
    alt: `${team.name} ${type === "home" ? "ホーム" : "アウェイ"}ユニフォーム`,
    className,
    width: 48,
    height: 48,
  });
}

export function createTeamPhoto(team, className = "team-photo") {
  if (!team?.teamPhoto) return null;
  return createTeamImage({
    src: team.teamPhoto,
    alt: `${team.name} 集合写真`,
    className,
    width: 1200,
    height: 675,
  });
}

export function createNotice(text) {
  return element("div", { className: "empty-note" }, [
    createIcon("info"),
    element("span", { text }),
  ]);
}
