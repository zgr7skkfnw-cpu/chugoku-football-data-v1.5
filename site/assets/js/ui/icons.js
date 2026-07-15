const iconPaths = {
  home: ["M3 10.75 12 3l9 7.75", "M5.5 9.5V21h13V9.5", "M9 21v-6h6v6"],
  matches: ["M12 3v18", "M3 12h18", "M5.6 5.6a9 9 0 0 0 12.8 12.8", "M18.4 5.6A9 9 0 0 0 5.6 18.4"],
  standings: ["M5 21V10h4v11", "M10 21V4h4v17", "M15 21v-7h4v7", "M3 21h18"],
  teams: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  players: ["M20 21a8 8 0 0 0-16 0", "M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z", "M12 17v4"],
  rankings: ["M8 21h8", "M12 17v4", "M7 4h10v4a5 5 0 0 1-10 0V4Z", "M7 6H4v1a4 4 0 0 0 4 4", "M17 6h3v1a4 4 0 0 1-4 4"],
  following: ["M12 2.8 14.8 8l5.8.8-4.2 4.1 1 5.8-5.2-2.7L8 18.7l1-5.8-4.2-4.1 5.8-.8Z"],
  search: ["M21 21l-4.4-4.4", "M10.8 18a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4Z"],
  info: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M12 10v6", "M12 7h.01"],
};

export function createIcon(name) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  for (const data of iconPaths[name] ?? iconPaths.info) {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", data);
    svg.append(path);
  }

  return svg;
}
