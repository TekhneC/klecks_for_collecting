import { CatalogGroup, CollectionDetail } from './catalog';
import { CaptureStatus, WorkMeta } from './model';

export const CAPTURE_DOCK_PX = 84;

export type CaptureStats = {
    status: CaptureStatus;
    processMs: number;
    persisted: number;
    pending: number;
    error: string | null;
    pauseEdits: number;
};

export type WorkOption = { workId: string; label: string; updatedAt?: string };

export type ReplayUi = {
    replaying: boolean;
    playing: boolean;
    timeMs: number;
    durationMs: number;
};

export type CapturePanel = {
    readInto: (work: WorkMeta) => void;
    write: (work: WorkMeta) => void;
    setStatus: (text: string, tone?: 'info' | 'error') => void;
    setStats: (stats: CaptureStats) => void;
    setWorks: (works: WorkOption[], selectedId?: string) => void;
    getSelectedWorkId: () => string;
    getAuthorId: () => string;
    setCurrentWorkLabel: (label: string) => void;
    getSpeed: () => number;
    setReplayUi: (ui: ReplayUi) => void;
    collapse: () => void;
    showGate: () => void;
    showWorkInfo: () => void;
    showCatalog: (groups: CatalogGroup[]) => void;
    showCatalogDetail: (workId: string, detail: CollectionDetail) => void;
    hidePaintingForAdmin: () => void;
    showAdminLock: (mode: 'set' | 'enter') => void;
    setAdminLockError: (text: string) => void;
    setAdminNotice: (text: string) => void;
    showAdminReplay: (canvas: HTMLCanvasElement) => void;
    hideAdminReplay: (note?: string) => void;
};

const META_FIELDS: { key: keyof WorkMeta; label: string; placeholder?: string }[] = [
    { key: 'title', label: '标题' },
    { key: 'theme', label: '主题' },
    { key: 'referenceNote', label: '参考材料' },
    { key: 'referenceSource', label: '来源' },
    { key: 'licenseScope', label: '授权范围', placeholder: '训练 / 展示 / 发布' },
    { key: 'tabletNote', label: '数位板（可后补）' },
    { key: 'driverNote', label: '驱动（可后补）' },
];

const STATUS_LABEL: Record<CaptureStatus, string> = {
    idle: '未开始',
    recording: '采集中',
    paused: '已暂停',
    ended: '已结束',
};

function formatClock(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatReplay(ms: number): string {
    return `${(Math.max(0, ms) / 1000).toFixed(3)} s`;
}

function formatUpdated(iso: string | undefined): string {
    if (!iso) {
        return '';
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function showText(value: string | undefined): string {
    const text = value?.trim();
    return text ? text : '未填写';
}

function fieldLabel(text: string, control: HTMLElement): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'field';
    label.append(document.createTextNode(text));
    label.append(control);
    return label;
}

export function mountCapturePanel(actions: {
    onStart: () => void;
    onContinue: () => void;
    onPause: () => void;
    onResume: () => void;
    onEnd: () => void;
    onSave: () => void;
    onExport: () => void;
    onSubmit: () => void;
    onImport: (file: File) => void;
    onRefresh: () => void;
    onAuthor: (authorId: string) => void;
    onCreate: () => void;
    onWatch: () => void;
    onResumePaint: () => void;
    onOpenWork: () => void;
    onSwitch: () => void;
    onPlay: () => void;
    onPauseReplay: () => void;
    onExitReplay: () => void;
    onSeek: (timeMs: number) => void;
    onSpeed: (speed: number) => void;
    writeForm: (work: WorkMeta) => void;
    onEditWorkInfo: () => void;
    onSaveWorkInfo: () => void;
    onCancelWorkInfo: () => void;
    onCatalogWork: (workId: string) => void;
    onAdminPassword: (password: string, confirmPassword: string, setting: boolean) => void;
    onChangeAdminPassword: (currentPassword: string, nextPassword: string, confirmPassword: string) => void;
    onDeleteWork: (workId: string) => void;
    onDeleteAuthor: (authorId: string) => void;
    onWatchCatalog: (workId: string) => void;
    onExitAdminReplay: () => void;
}): CapturePanel {
    const style = document.createElement('style');
    style.textContent = `
      .kc-dock, .kc-dock * , .kc-gate, .kc-gate * { box-sizing: border-box; }
      .kc-dock { position: fixed; z-index: 30; left: 0; right: 0; bottom: 0; height: ${CAPTURE_DOCK_PX}px;
        display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 6px 8px;
        background: #fafafa; color: #171717; border-top: 1px solid #e5e5e5;
        font: 13px/1.3 system-ui, "Segoe UI", sans-serif; }
      .kc-dock:not(.studio) { display: none; }
      .kc-dock button, .kc-dock select {
        font: inherit; background: #fff; color: #171717; border: 1px solid #e5e5e5;
        border-radius: 8px; padding: 4px 8px; }
      .kc-dock button { cursor: pointer; white-space: nowrap; }
      .kc-dock button.primary, .kc-dock button[aria-pressed="true"] { background: #171717; color: #fff; border-color: #171717; }
      .kc-dock button:disabled { opacity: .4; cursor: default; }
      .kc-dock input[type="range"] { flex: 1; min-width: 80px; accent-color: #171717; }
      .kc-dock .row { display: flex; align-items: center; gap: 6px; min-width: 0; }
      .kc-dock .row > button, .kc-dock .pair, .kc-dock .pill, .kc-dock .clock { flex: 0 0 auto; }
      .kc-dock .pair { display: flex; flex: 0 0 auto; }
      .kc-dock .pair button { padding: 6px 12px; font-weight: 600; }
      .kc-dock .pair button:first-child { border-radius: 8px 0 0 8px; }
      .kc-dock .pair button:last-child { border-radius: 0 8px 8px 0; margin-left: -1px; }
      .kc-dock .scrub { position: relative; display: flex; align-items: center; gap: 6px; flex: 1; min-width: 140px; }
      .kc-dock .transport { position: relative; width: 32px; padding: 4px 0; flex: 0 0 auto; }
      .kc-dock .transport[hidden] { display: none !important; }
      .kc-dock .transport::after { content: attr(data-tip); position: absolute; left: 50%; bottom: calc(100% + 6px);
        transform: translateX(-50%); padding: 2px 6px; border-radius: 6px; background: #171717; color: #fff;
        font-size: 12px; line-height: 1.4; white-space: nowrap; opacity: 0; pointer-events: none; }
      .kc-dock .transport:hover::after { opacity: 1; }
      .kc-dock .hint, .kc-dock .status { color: #737373; }
      .kc-dock .status { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .kc-dock .status.error { color: #b42318; }
      .kc-dock .work-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px; }
      .kc-dock .time { min-width: 72px; text-align: right; font-variant-numeric: tabular-nums; }
      .kc-dock .pill { border-radius: 99px; padding: 1px 8px; background: #f0f0f0; }
      .kc-dock .pill.recording { background: #171717; color: #fff; }
      .kc-dock .pill.paused, .kc-dock .pill.error { background: #f5f0e8; }
      .kc-dock .pill.ended { background: #ececec; }
      .kc-dock .file-pop { display: none; position: absolute; right: 8px; bottom: ${CAPTURE_DOCK_PX}px;
        padding: 8px; background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; }
      .kc-dock.files .file-pop { display: flex; gap: 6px; }
      .kc-dock .file { display: none; }
      .kc-dock .grow { flex: 1; }
      html.kc-gate-open body > :not(.kc-gate):not(.kc-admin) { visibility: hidden !important; }
      .kc-gate { position: fixed; z-index: 200; inset: 0; display: flex; align-items: flex-start; justify-content: center;
        padding: 12vh 24px 48px; overflow: auto; background: #f5f5f4; color: #171717; color-scheme: light;
        font: 15px/1.5 system-ui, "Segoe UI", sans-serif; }
      .kc-gate [hidden] { display: none !important; }
      html.kl-theme-dark .kc-gate input,
      html.kl-theme-dark .kc-gate select,
      html.kl-theme-dark .kc-gate input:focus,
      html.kl-theme-dark .kc-gate select:focus { background: #fff; color: #171717; border-color: #e5e5e5; box-shadow: none; }
      .kc-gate[hidden] { display: none; }
      .kc-gate .card { width: min(880px, 100%); background: transparent; }
      .kc-gate h1 { margin: 0 0 8px; font-size: 32px; font-weight: 560; letter-spacing: -0.03em; }
      .kc-gate .lead { margin: 0 0 28px; color: #737373; }
      .kc-gate .field { display: grid; gap: 6px; margin: 0 0 14px; font-size: 13px; color: #404040; }
      .kc-gate .field.mode { max-width: 280px; }
      .kc-gate input, .kc-gate select, .kc-gate button {
        font: inherit; width: 100%; color: #171717; background: #fff; border: 1px solid #e5e5e5;
        border-radius: 10px; padding: 12px 14px; outline: none; }
      .kc-gate button { cursor: pointer; }
      .kc-gate input:focus, .kc-gate select:focus { border-color: #171717; }
      .kc-gate .choices { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0 0 18px;
        position: sticky; top: 0; z-index: 2; background: #f5f5f4; padding: 8px 0; }
      .kc-gate .works { display: flex; flex-direction: column; gap: 8px; margin: 4px 0 18px; }
      .kc-gate .works button { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; text-align: left; }
      .kc-gate .works button .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .kc-gate .works .when { flex: 0 0 auto; color: #a3a3a3; font-size: 12px; font-weight: 400; }
      .kc-gate .works button.selected { background: #4a4a4a; color: #fff; border-color: #4a4a4a; }
      .kc-gate .works button.selected .when { color: rgba(255,255,255,.72); }
      .kc-gate .actions { display: flex; gap: 8px; margin: 4px 0 0; }
      .kc-gate .actions button { flex: 1 1 0; width: auto; }
      .kc-gate button.quiet { background: transparent; }
      .kc-admin { position: fixed; z-index: 220; inset: 0; overflow: auto; background: #f5f5f4; color: #171717;
        padding: 32px 24px 48px; font: 15px/1.5 system-ui, "Segoe UI", sans-serif; }
      .kc-admin[hidden] { display: none !important; }
      .kc-admin .card { width: min(1080px, 100%); margin: 0 auto; }
      .kc-admin h1 { margin: 0 0 8px; font-size: 32px; font-weight: 560; letter-spacing: -0.03em; }
      .kc-admin .lead { margin: 0; color: #737373; }
      .kc-admin .head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 24px; }
      .kc-admin button { font: inherit; color: #171717; background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; padding: 8px 12px; cursor: pointer; white-space: nowrap; }
      .kc-admin input, html.kl-theme-dark .kc-admin input { background: #fff; color: #171717; }
      .kc-admin .body { display: grid; grid-template-columns: minmax(240px, 320px) minmax(0, 1fr); gap: 24px; align-items: start; }
      .kc-admin h2 { margin: 18px 0 8px; font-size: 13px; font-weight: 600; color: #737373; }
      .kc-admin h2:first-child { margin-top: 0; }
      .kc-admin .tree button { width: 100%; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; text-align: left; margin: 0 0 8px; }
      .kc-admin .tree button .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .kc-admin .tree button.selected { background: #171717; color: #fff; border-color: #171717; }
      .kc-admin .when { flex: 0 0 auto; color: #a3a3a3; font-size: 12px; }
      .kc-admin .tree button.selected .when { color: rgba(255,255,255,.72); }
      .kc-admin .detail { position: relative; background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 16px 18px; }
      .kc-admin .detail-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .kc-admin .detail-head h3 { margin: 0; font-size: 16px; }
      .kc-admin .detail h3 { margin: 18px 0 12px; font-size: 16px; }
      .kc-admin dt { color: #737373; font-size: 13px; }
      .kc-admin dd { margin: 0 0 10px; }
      .kc-admin .empty, .kc-admin .notice { color: #737373; }
      .kc-admin .error { color: #b42318; }
      html.kc-admin-mode .kc-gate, html.kc-admin-mode .kc-dock { display: none !important; }
      .kc-admin .lock { width: min(420px, 100%); margin: 10vh auto 0; }
      .kc-admin .lock input, .kc-admin .password input { font: inherit; width: 100%; padding: 12px 14px; border: 1px solid #e5e5e5; border-radius: 10px; }
      .kc-admin .lock input { margin: 0 0 12px; }
      .kc-admin .lock button { width: 100%; }
      .kc-admin .password { display: grid; gap: 8px; flex: 1 1 240px; max-width: 320px; }
      .kc-admin .author { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .kc-admin .author h2 { margin: 12px 0; }
      .kc-admin .danger { color: #b42318; }
      .kc-admin .stage { margin: 14px 0 4px; background: #f5f5f4; border-radius: 10px; overflow: hidden; }
      .kc-admin .stage canvas { display: block; width: 100%; height: auto; background: #fff; }
      .kc-admin .stage .empty { margin: 0; padding: 28px 12px; text-align: center; }
      .kc-admin .replay-bar { display: none; gap: 8px; align-items: center; padding: 8px; background: #fafafa; }
      .kc-admin .replay-bar.visible { display: flex; }
      .kc-admin .transport { position: relative; width: 32px; }
      .kc-admin .transport::after { content: attr(data-tip); position: absolute; left: 50%; bottom: calc(100% + 6px);
        transform: translateX(-50%); padding: 2px 6px; border-radius: 6px; background: #171717; color: #fff;
        font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none; }
      .kc-admin .transport:hover::after { opacity: 1; }
      .kc-admin .replay-bar input[type="range"] { flex: 1; min-width: 80px; }
      @media (max-width: 800px) { .kc-admin .body { grid-template-columns: 1fr; } }
      .kc-gate button:hover { background: #e6e6e6; }
      .kc-gate button:disabled { opacity: .4; cursor: default; }
      .kc-gate button:disabled:hover { background: #fff; }
      .kc-gate button.primary,
      .kc-gate button.primary:hover,
      .kc-gate button[aria-pressed="true"],
      .kc-gate button[aria-pressed="true"]:hover,
      .kc-gate .works button.selected:hover { background: #4a4a4a; color: #fff; border-color: #4a4a4a; }
      .kc-gate .empty, .kc-gate .status { color: #737373; font-size: 13px; margin-top: 12px; }
      .kc-gate .status.error { color: #b42318; }
    `;
    document.head.append(style);
    document.documentElement.style.setProperty('--kc-dock', `${CAPTURE_DOCK_PX}px`);

    const inputs = new Map<keyof WorkMeta, HTMLInputElement | HTMLSelectElement>();
    const authorInput = document.createElement('input');
    authorInput.autocomplete = 'off';
    authorInput.placeholder = '填写后选择新建或已有作品';
    inputs.set('authorId', authorInput);
    const workIdInput = document.createElement('input');
    workIdInput.hidden = true;
    inputs.set('workId', workIdInput);

    const gate = document.createElement('div');
    gate.className = 'kc-gate';
    const card = document.createElement('div');
    card.className = 'card';
    const heading = document.createElement('h1');
    heading.textContent = '进入采集';
    const lead = document.createElement('p');
    lead.className = 'lead';
    lead.textContent = '填写作者编号。然后选择新建作品或已有作品，准备好后进入绘画。';
    const choices = document.createElement('div');
    choices.className = 'choices';
    choices.hidden = true;
    const choiceNew = document.createElement('button');
    choiceNew.type = 'button';
    choiceNew.textContent = '新建作品';
    const choiceExisting = document.createElement('button');
    choiceExisting.type = 'button';
    choiceExisting.textContent = '选择已有作品';
    choices.append(choiceNew, choiceExisting);

    const newFields = document.createElement('div');
    newFields.hidden = true;
    const mode = document.createElement('select');
    mode.innerHTML = '<option value="free">自由</option><option value="assigned">指定</option>';
    const modeField = fieldLabel('创作类型', mode);
    modeField.classList.add('mode');
    newFields.append(modeField);
    for (const field of META_FIELDS) {
        const input = document.createElement('input');
        input.placeholder = field.placeholder ?? '';
        inputs.set(field.key, input);
        newFields.append(fieldLabel(field.label, input));
    }
    const existingList = document.createElement('div');
    existingList.className = 'works';
    existingList.hidden = true;
    const gateStatus = document.createElement('div');
    gateStatus.className = 'status';
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.textContent = '返回绘画';
    backBtn.hidden = true;
    const actionRow = document.createElement('div');
    actionRow.className = 'actions';
    actionRow.hidden = true;
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'primary';
    doneBtn.textContent = '保存';
    doneBtn.hidden = true;
    const enterBtn = document.createElement('button');
    enterBtn.type = 'button';
    enterBtn.className = 'primary';
    enterBtn.textContent = '进入绘画';
    enterBtn.hidden = true;
    actionRow.append(doneBtn, backBtn);
    card.append(heading, lead, fieldLabel('作者编号', authorInput), workIdInput, choices, newFields, existingList, enterBtn, actionRow, gateStatus);
    gate.append(card);

    const root = document.createElement('section');
    root.className = 'kc-dock';
    root.innerHTML = `
      <div class="file-pop"></div>
      <div class="row">
        <div class="pair">
          <button type="button" class="rest">暂停休息</button>
          <button type="button" class="resume-paint">继续绘画</button>
        </div>
        <span class="hint">Shift+空格</span>
        <button type="button" class="watch">观看回放</button>
        <label>速度 <select class="speed" aria-label="速度">
          <option value="0.25">0.25×</option>
          <option value="0.5">0.5×</option>
          <option value="1">1×</option>
          <option value="2">2×</option>
          <option value="4">4×</option>
          <option value="8">8×</option>
          <option value="16" selected>16×</option>
        </select></label>
        <div class="scrub">
          <button type="button" class="transport" hidden aria-label="暂停" data-tip="暂停">||</button>
          <input class="timeline" aria-label="回放进度" type="range" min="0" max="1" value="0" step="any" disabled>
        </div>
        <output class="time">0.000 s</output>
      </div>
      <div class="row">
        <span class="pill">未开始</span>
        <span class="clock">0:00</span>
        <span class="work-name">未命名作品</span>
        <span class="saved"></span>
        <span class="status"></span>
        <button type="button" class="info">作品信息</button>
        <button type="button" class="end">结束</button>
        <button type="button" class="switch">切换作品</button>
        <button type="button" class="files-toggle">记录</button>
      </div>
    `;
    const filePop = root.querySelector('.file-pop') as HTMLElement;
    const restButton = root.querySelector('.rest') as HTMLButtonElement;
    const resumePaintButton = root.querySelector('.resume-paint') as HTMLButtonElement;
    const watchButton = root.querySelector('.watch') as HTMLButtonElement;
    const transport = root.querySelector('.transport') as HTMLButtonElement;
    const speed = root.querySelector('.speed') as HTMLSelectElement;
    const timeline = root.querySelector('.timeline') as HTMLInputElement;
    const timeEl = root.querySelector('.time') as HTMLOutputElement;
    const pill = root.querySelector('.pill') as HTMLElement;
    const clockEl = root.querySelector('.clock') as HTMLElement;
    const workName = root.querySelector('.work-name') as HTMLElement;
    const savedEl = root.querySelector('.saved') as HTMLElement;
    const dockStatus = root.querySelector('.status') as HTMLElement;
    const endButton = root.querySelector('.end') as HTMLButtonElement;
    const infoButton = root.querySelector('.info') as HTMLButtonElement;
    const switchButton = root.querySelector('.switch') as HTMLButtonElement;
    const filesToggle = root.querySelector('.files-toggle') as HTMLButtonElement;

    const addFileButton = (text: string, run: () => void) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        button.addEventListener('click', () => {
            root.classList.remove('files');
            run();
        });
        filePop.append(button);
        return button;
    };
    const saveButton = addFileButton('保存', actions.onSave);
    addFileButton('导出', actions.onExport);
    addFileButton('本地提交', actions.onSubmit);
    const importButton = addFileButton('导入记录', () => fileInput.click());
    const fileInput = document.createElement('input');
    fileInput.className = 'file';
    fileInput.type = 'file';
    fileInput.accept = '.zip,application/zip';
    fileInput.addEventListener('change', () => {
        const picked = fileInput.files?.[0];
        if (picked) {
            actions.onImport(picked);
        }
        fileInput.value = '';
    });
    filePop.append(fileInput);
    void importButton;

    let gateMode: 'switch' | 'edit' = 'switch';
    let gatePath: 'none' | 'new' | 'existing' = 'none';
    let paintingLocked = false;
    let adminReplayActive = false;
    let syncAdminReplay = () => {};
    let selectedWorkId = '';
    let workOptions: WorkOption[] = [];
    let catalogGroups: CatalogGroup[] = [];
    let catalogWorkId = '';
    let replay: ReplayUi = { replaying: false, playing: false, timeMs: 0, durationMs: 0 };
    let stats: CaptureStats = { status: 'idle', processMs: 0, persisted: 0, pending: 0, error: null, pauseEdits: 0 };
    const currentWorkId = () => selectedWorkId || workIdInput.value.trim();
    const syncActions = () => {
        actionRow.hidden = doneBtn.hidden && backBtn.hidden;
    };
    const syncAuthor = () => {
        if (gateMode === 'edit') {
            choices.hidden = true;
            existingList.hidden = true;
            newFields.hidden = false;
            enterBtn.hidden = true;
            doneBtn.hidden = false;
            syncActions();
            return;
        }
        const hasAuthor = authorInput.value.trim().length > 0;
        if (!hasAuthor) {
            gatePath = 'none';
        }
        choices.hidden = !hasAuthor;
        newFields.hidden = gatePath !== 'new';
        existingList.hidden = gatePath !== 'existing';
        const ready = hasAuthor && (gatePath === 'new' || (gatePath === 'existing' && Boolean(selectedWorkId)));
        enterBtn.hidden = !ready;
        doneBtn.hidden = true;
        syncActions();
        choiceNew.setAttribute('aria-pressed', gatePath === 'new' ? 'true' : 'false');
        choiceExisting.setAttribute('aria-pressed', gatePath === 'existing' ? 'true' : 'false');
    };
    const workButton = (label: string, updatedAt: string | undefined, selected: boolean) => {
        const button = document.createElement('button');
        button.type = 'button';
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = label;
        button.append(name);
        const when = formatUpdated(updatedAt);
        if (when) {
            const time = document.createElement('span');
            time.className = 'when';
            time.textContent = when;
            button.append(time);
        }
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        return button;
    };
    const renderExisting = () => {
        existingList.replaceChildren();
        if (workOptions.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty';
            empty.textContent = '尚未有历史作品';
            existingList.append(empty);
        } else {
            for (const item of workOptions) {
                const button = workButton(item.label, item.updatedAt, item.workId === selectedWorkId);
                button.addEventListener('click', () => {
                    selectedWorkId = item.workId;
                    renderExisting();
                });
                existingList.append(button);
            }
        }
        syncAuthor();
    };
    const paint = () => {
        const showingReplay = replay.replaying;
        const workId = currentWorkId();
        pill.textContent = showingReplay ? '回放中' : STATUS_LABEL[stats.status];
        pill.className = `pill ${showingReplay ? 'paused' : stats.status}${stats.error ? ' error' : ''}`;
        clockEl.textContent = formatClock(stats.processMs);
        const title = (inputs.get('title') as HTMLInputElement).value.trim();
        workName.textContent = title || workOptions.find((item) => item.workId === workId)?.label || '未命名作品';
        savedEl.textContent = stats.error ? '保存失败' : `已写入 ${stats.persisted}`;
        const lockIdentity = stats.status === 'recording' || stats.status === 'paused';
        authorInput.disabled = lockIdentity;
        const paintingNow = !showingReplay && stats.status === 'recording';
        restButton.disabled = !paintingNow;
        resumePaintButton.disabled = paintingNow || !workId;
        restButton.classList.toggle('primary', paintingNow);
        resumePaintButton.classList.toggle('primary', !paintingNow && Boolean(workId));
        restButton.setAttribute('aria-pressed', paintingNow ? 'true' : 'false');
        resumePaintButton.setAttribute('aria-pressed', !paintingNow && stats.status === 'paused' ? 'true' : 'false');
        watchButton.disabled = !workId;
        watchButton.setAttribute('aria-pressed', showingReplay ? 'true' : 'false');
        transport.hidden = !showingReplay;
        if (replay.playing) {
            transport.textContent = '||';
            transport.dataset.tip = '暂停';
            transport.setAttribute('aria-label', '暂停');
        } else {
            transport.textContent = '▲';
            transport.dataset.tip = '播放';
            transport.setAttribute('aria-label', '播放');
        }
        infoButton.disabled = !workId;
        endButton.disabled = !(stats.status === 'recording' || stats.status === 'paused');
        saveButton.disabled = !(stats.status === 'recording' || stats.status === 'paused' || stats.pending > 0);
        switchButton.disabled = false;
        timeline.disabled = replay.durationMs <= 0;
        timeline.max = String(Math.max(1, replay.durationMs));
        if (!timeline.matches(':active')) {
            timeline.value = String(Math.min(replay.timeMs, Number(timeline.max)));
        }
        timeEl.textContent = formatReplay(replay.timeMs);
        syncAdminReplay();
    };
    const setGateOpen = (open: boolean) => {
        document.documentElement.classList.toggle('kc-gate-open', open);
    };
    const enterStudio = () => {
        gate.hidden = true;
        setGateOpen(false);
        backBtn.hidden = false;
        root.classList.add('studio');
        root.classList.remove('files');
        paint();
    };
    const showGate = () => {
        if (paintingLocked) {
            return;
        }
        gateMode = 'switch';
        gatePath = 'none';
        heading.textContent = '进入采集';
        lead.textContent = '填写作者编号。然后选择新建作品或已有作品，准备好后进入绘画。';
        backBtn.textContent = '返回绘画';
        root.classList.remove('studio');
        root.classList.remove('files');
        gate.hidden = false;
        setGateOpen(true);
        renderExisting();
    };
    const showWorkInfo = () => {
        if (paintingLocked) {
            return;
        }
        gateMode = 'edit';
        heading.textContent = '作品信息';
        lead.textContent = '填写期间计时自动暂停。保存会更新这一幅作品的收集信息并留在本页；返回绘画回到画布后自动恢复计时。不会切换作品，也不会结束这一轮。';
        backBtn.hidden = false;
        backBtn.textContent = '返回绘画';
        gate.hidden = false;
        setGateOpen(true);
        syncAuthor();
    };
    const setStatus = (text: string, tone: 'info' | 'error' = 'info') => {
        gateStatus.textContent = text;
        dockStatus.textContent = text;
        gateStatus.classList.toggle('error', tone === 'error');
        dockStatus.classList.toggle('error', tone === 'error');
    };

    authorInput.addEventListener('input', () => {
        selectedWorkId = '';
        workOptions = [];
        gatePath = 'none';
        renderExisting();
        actions.onAuthor(authorInput.value.trim());
    });
    choiceNew.addEventListener('click', () => {
        gatePath = 'new';
        workIdInput.value = '';
        selectedWorkId = '';
        renderExisting();
    });
    choiceExisting.addEventListener('click', () => {
        gatePath = 'existing';
        renderExisting();
    });
    enterBtn.addEventListener('click', () => {
        if (gatePath === 'new') {
            actions.onCreate();
            return;
        }
        if (!selectedWorkId) {
            setStatus('先选中一个历史作品。', 'error');
            return;
        }
        actions.onOpenWork();
    });
    backBtn.addEventListener('click', () => {
        if (gateMode === 'edit') {
            actions.onCancelWorkInfo();
            return;
        }
        enterStudio();
    });
    doneBtn.addEventListener('click', () => actions.onSaveWorkInfo());
    restButton.addEventListener('click', actions.onPause);
    resumePaintButton.addEventListener('click', () => actions.onResumePaint());
    watchButton.addEventListener('click', () => actions.onWatch());
    transport.addEventListener('click', () => {
        if (replay.playing) {
            actions.onPauseReplay();
            return;
        }
        actions.onPlay();
    });
    infoButton.addEventListener('click', () => actions.onEditWorkInfo());
    endButton.addEventListener('click', actions.onEnd);
    switchButton.addEventListener('click', () => actions.onSwitch());
    filesToggle.addEventListener('click', () => root.classList.toggle('files'));
    speed.addEventListener('change', () => actions.onSpeed(Number(speed.value)));
    timeline.addEventListener('input', () => actions.onSeek(Number(timeline.value)));
    document.addEventListener('keydown', (event) => {
        if (event.code !== 'Space' || !event.shiftKey || event.repeat || !gate.hidden) {
            return;
        }
        const target = event.target;
        if (target instanceof HTMLElement) {
            const tag = target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
                return;
            }
        }
        event.preventDefault();
        event.stopPropagation();
        if (!replay.replaying && stats.status === 'recording') {
            actions.onPause();
            return;
        }
        actions.onResumePaint();
    }, true);

    const leaveAdmin = () => {
        const url = new URL(location.href);
        url.searchParams.delete('admin');
        location.assign(`${url.pathname}${url.search}${url.hash}`);
    };
    const admin = document.createElement('div');
    admin.className = 'kc-admin';
    admin.hidden = true;
    const lock = document.createElement('form');
    lock.className = 'lock';
    lock.hidden = true;
    const lockTitle = document.createElement('h1');
    const lockLead = document.createElement('p');
    lockLead.className = 'lead';
    const lockPassword = document.createElement('input');
    lockPassword.type = 'password';
    lockPassword.autocomplete = 'current-password';
    lockPassword.placeholder = '管理密码';
    const lockConfirm = document.createElement('input');
    lockConfirm.type = 'password';
    lockConfirm.autocomplete = 'new-password';
    lockConfirm.placeholder = '再输入一次';
    const lockError = document.createElement('div');
    lockError.className = 'error';
    const lockSubmit = document.createElement('button');
    lockSubmit.type = 'submit';
    const lockLeave = document.createElement('button');
    lockLeave.type = 'button';
    lockLeave.className = 'quiet';
    lockLeave.textContent = '回到绘画';
    lockLeave.addEventListener('click', leaveAdmin);
    lock.append(lockTitle, lockLead, lockPassword, lockConfirm, lockError, lockSubmit, lockLeave);
    lock.addEventListener('submit', (event) => {
        event.preventDefault();
        actions.onAdminPassword(lockPassword.value, lockConfirm.value, !lockConfirm.hidden);
    });
    const adminCard = document.createElement('div');
    adminCard.className = 'card';
    const adminHead = document.createElement('div');
    adminHead.className = 'head';
    const adminIntro = document.createElement('div');
    const adminTitle = document.createElement('h1');
    adminTitle.textContent = '管理收集';
    const adminLead = document.createElement('p');
    adminLead.className = 'lead';
    adminLead.textContent = '按作者和作品查看本机收集信息和统计。没有远程验收。';
    const adminNotice = document.createElement('div');
    adminNotice.className = 'notice';
    adminIntro.append(adminTitle, adminLead, adminNotice);
    const passwordForm = document.createElement('form');
    passwordForm.className = 'password';
    const currentPassword = document.createElement('input');
    currentPassword.type = 'password';
    currentPassword.autocomplete = 'current-password';
    currentPassword.placeholder = '当前密码';
    const nextPassword = document.createElement('input');
    nextPassword.type = 'password';
    nextPassword.autocomplete = 'new-password';
    nextPassword.placeholder = '新密码';
    const confirmPassword = document.createElement('input');
    confirmPassword.type = 'password';
    confirmPassword.autocomplete = 'new-password';
    confirmPassword.placeholder = '再输入新密码';
    const changePassword = document.createElement('button');
    changePassword.type = 'submit';
    changePassword.textContent = '修改密码';
    passwordForm.append(currentPassword, nextPassword, confirmPassword, changePassword);
    passwordForm.addEventListener('submit', (event) => {
        event.preventDefault();
        actions.onChangeAdminPassword(currentPassword.value, nextPassword.value, confirmPassword.value);
    });
    const adminClose = document.createElement('button');
    adminClose.type = 'button';
    adminClose.textContent = '回到绘画';
    adminClose.addEventListener('click', leaveAdmin);
    adminHead.append(adminIntro, passwordForm, adminClose);
    const adminBody = document.createElement('div');
    adminBody.className = 'body';
    const tree = document.createElement('div');
    tree.className = 'tree';
    const detail = document.createElement('div');
    detail.className = 'detail';
    adminBody.append(tree, detail);
    adminCard.append(adminHead, adminBody);
    const replayBar = document.createElement('div');
    replayBar.className = 'replay-bar';
    const adminTransport = document.createElement('button');
    adminTransport.type = 'button';
    adminTransport.className = 'transport';
    adminTransport.textContent = '||';
    adminTransport.dataset.tip = '暂停';
    const adminTimeline = document.createElement('input');
    adminTimeline.type = 'range';
    adminTimeline.min = '0';
    adminTimeline.max = '1';
    adminTimeline.step = 'any';
    adminTimeline.value = '0';
    adminTimeline.setAttribute('aria-label', '回放进度');
    const adminSpeed = document.createElement('select');
    adminSpeed.setAttribute('aria-label', '速度');
    adminSpeed.innerHTML = `
      <option value="0.25">0.25×</option>
      <option value="0.5">0.5×</option>
      <option value="1">1×</option>
      <option value="2">2×</option>
      <option value="4">4×</option>
      <option value="8">8×</option>
      <option value="16" selected>16×</option>
    `;
    const adminTime = document.createElement('output');
    adminTime.textContent = '0.000 s';
    replayBar.append(adminTransport, adminTimeline, adminSpeed, adminTime);
    admin.append(lock, adminCard, replayBar);
    syncAdminReplay = () => {
        replayBar.classList.toggle('visible', adminReplayActive);
        if (!adminReplayActive) {
            return;
        }
        if (replay.playing) {
            adminTransport.textContent = '||';
            adminTransport.dataset.tip = '暂停';
            adminTransport.setAttribute('aria-label', '暂停');
        } else {
            adminTransport.textContent = '▲';
            adminTransport.dataset.tip = '播放';
            adminTransport.setAttribute('aria-label', '播放');
        }
        adminTimeline.disabled = replay.durationMs <= 0;
        adminTimeline.max = String(Math.max(1, replay.durationMs));
        if (!adminTimeline.matches(':active')) {
            adminTimeline.value = String(Math.min(replay.timeMs, Number(adminTimeline.max)));
        }
        adminTime.textContent = formatReplay(replay.timeMs);
    };
    adminTransport.addEventListener('click', () => {
        if (replay.playing) {
            actions.onPauseReplay();
            return;
        }
        actions.onPlay();
    });
    adminTimeline.addEventListener('input', () => actions.onSeek(Number(adminTimeline.value)));
    adminSpeed.addEventListener('change', () => actions.onSpeed(Number(adminSpeed.value)));

    let adminStage: HTMLDivElement | null = null;
    const definitionList = (rows: [string, string][]) => {
        const list = document.createElement('dl');
        for (const [term, value] of rows) {
            const dt = document.createElement('dt');
            dt.textContent = term;
            const dd = document.createElement('dd');
            dd.textContent = value;
            list.append(dt, dd);
        }
        return list;
    };
    const renderCatalogTree = () => {
        tree.replaceChildren();
        if (catalogGroups.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'empty';
            empty.textContent = '还没有收集记录。';
            tree.append(empty);
            return;
        }
        for (const group of catalogGroups) {
            const authorRow = document.createElement('div');
            authorRow.className = 'author';
            const heading = document.createElement('h2');
            heading.textContent = group.label;
            const removeAuthor = document.createElement('button');
            removeAuthor.type = 'button';
            removeAuthor.className = 'danger';
            removeAuthor.textContent = '删除作者';
            removeAuthor.addEventListener('click', () => actions.onDeleteAuthor(group.authorId));
            authorRow.append(heading, removeAuthor);
            tree.append(authorRow);
            for (const work of group.works) {
                const button = workButton(work.title || work.workId, work.updatedAt, work.workId === catalogWorkId);
                button.addEventListener('click', () => actions.onCatalogWork(work.workId));
                tree.append(button);
            }
        }
    };
    const renderCatalogDetail = (detailView: CollectionDetail) => {
        const info = detailView.info;
        const stored = catalogGroups.flatMap((group) => group.works).find((work) => work.workId === catalogWorkId);
        detail.replaceChildren();
        const detailHead = document.createElement('div');
        detailHead.className = 'detail-head';
        const infoTitle = document.createElement('h3');
        infoTitle.textContent = '收集信息';
        const removeWork = document.createElement('button');
        removeWork.type = 'button';
        removeWork.className = 'danger';
        removeWork.textContent = '删除作品';
        removeWork.addEventListener('click', () => actions.onDeleteWork(catalogWorkId));
        detailHead.append(infoTitle, removeWork);
        const stage = document.createElement('div');
        stage.className = 'stage';
        adminStage = stage;
        const stageNote = document.createElement('p');
        stageNote.className = 'empty';
        stageNote.textContent = '正在准备回放。';
        stage.append(stageNote, replayBar);
        const infoList = definitionList([
            ['作者编号', showText(info?.authorId || stored?.authorId)],
            ['作品编号', catalogWorkId || '未填写'],
            ['标题', showText(info?.title || stored?.title)],
            ['创作类型', info ? (info.creationMode === 'assigned' ? '指定' : '自由') : '未填写'],
            ['主题', showText(info?.theme)],
            ['参考材料', showText(info?.referenceNote)],
            ['来源', showText(info?.referenceSource)],
            ['授权范围', showText(info?.licenseScope)],
            ['数位板', showText(info?.tabletNote)],
            ['驱动', showText(info?.driverNote)],
        ]);
        const statTitle = document.createElement('h3');
        statTitle.textContent = '统计信息';
        const seconds = (detailView.stats.processMs / 1000).toFixed(1);
        const statList = definitionList([
            ['最后更新', formatUpdated(detailView.stats.updatedAt) || '未填写'],
            ['过程时长', `${formatClock(detailView.stats.processMs)}（${seconds} 秒）`],
            ['会话', String(detailView.stats.sessions)],
            ['笔画', String(detailView.stats.strokes)],
            ['检查点', String(detailView.stats.checkpoints)],
            ['操作', String(detailView.stats.operations)],
            ['记录条数', String(detailView.stats.records)],
        ]);
        detail.append(detailHead, stage, infoList, statTitle, statList);
    };

    document.body.append(gate, root, admin);
    setGateOpen(true);
    paint();

    return {
        readInto: (work) => {
            for (const [key, input] of inputs) {
                work[key] = input.value.trim();
            }
            work.creationMode = mode.value === 'assigned' ? 'assigned' : 'free';
            actions.writeForm(work);
        },
        write: (work) => {
            for (const [key, input] of inputs) {
                input.value = work[key] ?? '';
            }
            mode.value = work.creationMode;
            if (work.workId) {
                selectedWorkId = work.workId;
            }
            renderExisting();
            paint();
        },
        setStatus,
        setStats: (next) => {
            stats = next;
            paint();
        },
        setWorks: (list, selectedId) => {
            workOptions = list;
            if (selectedId) {
                selectedWorkId = selectedId;
            }
            if (!list.some((item) => item.workId === selectedWorkId)) {
                selectedWorkId = '';
            }
            renderExisting();
            paint();
        },
        getSelectedWorkId: () => currentWorkId(),
        getAuthorId: () => authorInput.value.trim(),
        setCurrentWorkLabel: (label) => {
            if (label) {
                workName.textContent = label;
            }
        },
        getSpeed: () => Number((adminReplayActive ? adminSpeed : speed).value) || 16,
        setReplayUi: (ui) => {
            replay = ui;
            paint();
        },
        collapse: enterStudio,
        showGate,
        showWorkInfo,
        showCatalog: (groups) => {
            catalogGroups = groups;
            catalogWorkId = '';
            adminReplayActive = false;
            admin.classList.remove('replay');
            lock.hidden = true;
            adminCard.hidden = false;
            renderCatalogTree();
            detail.replaceChildren();
            const empty = document.createElement('p');
            empty.className = 'empty';
            empty.textContent = groups.length === 0
                ? '还没有收集记录。'
                : '选中左侧作品后，这里显示收集信息和统计。';
            detail.append(empty);
            admin.hidden = false;
        },
        showCatalogDetail: (workId, detailView) => {
            catalogWorkId = workId;
            renderCatalogTree();
            renderCatalogDetail(detailView);
        },
        hidePaintingForAdmin: () => {
            paintingLocked = true;
            document.documentElement.classList.add('kc-admin-mode');
            gate.hidden = true;
            setGateOpen(false);
        },
        showAdminLock: (mode) => {
            adminReplayActive = false;
            admin.classList.remove('replay');
            admin.hidden = false;
            adminCard.hidden = true;
            lock.hidden = false;
            lockError.textContent = '';
            lockPassword.value = '';
            lockConfirm.value = '';
            lockConfirm.hidden = mode !== 'set';
            lockTitle.textContent = mode === 'set' ? '设置管理密码' : '管理收集';
            lockLead.textContent = mode === 'set'
                ? '第一次进入时在这里设置密码。之后在这个后台直接修改，不另开页面。密码只保存在这台浏览器里。'
                : '输入管理密码。';
            lockSubmit.textContent = mode === 'set' ? '设置密码' : '进入';
            lockPassword.focus();
        },
        setAdminLockError: (text) => {
            lockError.textContent = text;
        },
        setAdminNotice: (text) => {
            adminNotice.textContent = text;
            adminNotice.classList.toggle('error', text.includes('不正确') || text.includes('不一致') || text.includes('先填写'));
            if (text === '密码已更新。') {
                currentPassword.value = '';
                nextPassword.value = '';
                confirmPassword.value = '';
            }
        },
        showAdminReplay: (canvas) => {
            adminReplayActive = true;
            admin.classList.remove('replay');
            if (adminStage) {
                adminStage.querySelector('.empty')?.remove();
                if (canvas.parentElement !== adminStage) {
                    adminStage.prepend(canvas);
                }
            }
            paint();
        },
        hideAdminReplay: (note) => {
            adminReplayActive = false;
            admin.classList.remove('replay');
            if (adminStage) {
                adminStage.querySelector('canvas')?.remove();
                if (note) {
                    let empty = adminStage.querySelector('.empty');
                    if (!(empty instanceof HTMLElement)) {
                        empty = document.createElement('p');
                        empty.className = 'empty';
                        adminStage.prepend(empty);
                    }
                    empty.textContent = note;
                }
            }
            paint();
        },
    };
}
