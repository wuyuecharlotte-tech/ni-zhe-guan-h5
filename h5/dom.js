/* 安全建 DOM：只用 createElement / textContent / setAttribute，不拼 HTML 字符串。 */
window.h = (tag, props, ...kids) => {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'width') el.style.width = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === '') continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
};
