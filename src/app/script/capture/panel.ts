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

export type WorkOption = { workId: string; label: string };

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
      html.kc-gate-open body > :not(.kc-gate) { visibility: hidden !important; }
      .kc-gate { position: fixed; z-index: 200; inset: 0; display: flex; align-items: flex-start; justify-content: center;
        padding: 12vh 24px 48px; overflow: auto; background: #f5f5f4; color: #171717; color-scheme: light;
        font: 15px/1.5 system-ui, "Segoe UI", sans-serif; }
      .kc-gate [hidden] { display: none !important; }
      html.kl-theme-dark .kc-gate input,
      html.kl-theme-dark .kc-gate select,
      html.kl-theme-dark .kc-gate input:focus,
      html.kl-theme-dark .kc-gate select:focus { background: #fff; color: #171717; border-color: #e5e5e5; box-shadow: none; }
      .kc-gate[hidden] { display: none; }
      .kc-gate .card { width: min(420px, 100%); background: transparent; }
      .kc-gate h1 { margin: 0 0 8px; font-size: 32px; font-weight: 560; letter-spacing: -0.03em; }
      .kc-gate .lead { margin: 0 0 28px; color: #737373; }
      .kc-gate .field { display: grid; gap: 6px; margin: 0 0 14px; font-size: 13px; color: #404040; }
      .kc-gate input, .kc-gate select, .kc-gate button {
        font: inherit; width: 100%; color: #171717; background: #fff; border: 1px solid #e5e5e5;
        border-radius: 10px; padding: 12px 14px; outline: none; }
      .kc-gate button { cursor: pointer; }
      .kc-gate input:focus, .kc-gate select:focus { border-color: #171717; }
      .kc-gate .choices { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0 0 18px;
        position: sticky; top: 0; z-index: 2; background: #f5f5f4; padding: 8px 0; }
      .kc-gate .works { display: flex; flex-direction: column; gap: 8px; margin: 4px 0 18px; }
      .kc-gate .works button { text-align: left; }
      .kc-gate .works button.selected { background: #171717; color: #fff; border-color: #171717; }
      .kc-gate button:disabled { opacity: .4; cursor: default; }
      .kc-gate button.primary, .kc-gate button[aria-pressed="true"] { background: #171717; color: #fff; border-color: #171717; }
      .kc-gate .empty, .kc-gate .status { color: #737373; font-size: 13px; margin-top: 12px; }
      .kc-gate .status.error { color: #b42318; }
    `;
    document.head.append(style);
    document.documentElement.style.setProperty('--kc-dock', `${CAPTURE_DOCK_PX}px`);

    const inputs = new Map<keyof WorkMeta, HTMLInputElement | HTMLSelectElement>();
    const authorInput = document.createElement('input');
    authorInput.autocomplete = 'off';
    authorInput.placeholder = '输入后选择新建或已有作品';
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
    lead.textContent = '填写作者编号后列出历史作品。选中后进入该作品，或填写下方信息新建作品。';
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
    newFields.append(fieldLabel('创作类型', mode));
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
    card.append(heading, lead, fieldLabel('作者编号', authorInput), workIdInput, existingList, choices, newFields, gateStatus, backBtn);
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
        <button type="button" class="pause-replay" disabled>暂停回放</button>
        <label>速度 <select class="speed" aria-label="速度">
          <option value="0.25">0.25×</option>
          <option value="0.5">0.5×</option>
          <option value="1" selected>1×</option>
          <option value="2">2×</option>
          <option value="4">4×</option>
          <option value="8">8×</option>
          <option value="16">16×</option>
        </select></label>
        <input class="timeline" aria-label="回放进度" type="range" min="0" max="1" value="0" step="any" disabled>
        <output class="time">0.000 s</output>
      </div>
      <div class="row">
        <span class="pill">未开始</span>
        <span class="clock">0:00</span>
        <span class="work-name">未命名作品</span>
        <span class="saved"></span>
        <span class="status"></span>
        <button type="button" class="end">结束</button>
        <button type="button" class="switch">切换作品</button>
        <button type="button" class="files-toggle">记录</button>
      </div>
    `;
    const filePop = root.querySelector('.file-pop') as HTMLElement;
    const restButton = root.querySelector('.rest') as HTMLButtonElement;
    const resumePaintButton = root.querySelector('.resume-paint') as HTMLButtonElement;
    const watchButton = root.querySelector('.watch') as HTMLButtonElement;
    const pauseReplay = root.querySelector('.pause-replay') as HTMLButtonElement;
    const speed = root.querySelector('.speed') as HTMLSelectElement;
    const timeline = root.querySelector('.timeline') as HTMLInputElement;
    const timeEl = root.querySelector('.time') as HTMLOutputElement;
    const pill = root.querySelector('.pill') as HTMLElement;
    const clockEl = root.querySelector('.clock') as HTMLElement;
    const workName = root.querySelector('.work-name') as HTMLElement;
    const savedEl = root.querySelector('.saved') as HTMLElement;
    const dockStatus = root.querySelector('.status') as HTMLElement;
    const endButton = root.querySelector('.end') as HTMLButtonElement;
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

    let selectedWorkId = '';
    let workOptions: WorkOption[] = [];
    let replay: ReplayUi = { replaying: false, playing: false, timeMs: 0, durationMs: 0 };
    let stats: CaptureStats = { status: 'idle', processMs: 0, persisted: 0, pending: 0, error: null, pauseEdits: 0 };
    const currentWorkId = () => selectedWorkId || workIdInput.value.trim();
    const syncAuthor = () => {
        const hasAuthor = authorInput.value.trim().length > 0;
        choices.hidden = !hasAuthor;
        newFields.hidden = !hasAuthor;
        existingList.hidden = !hasAuthor;
        choiceExisting.disabled = !selectedWorkId;
        if (!hasAuthor) {
            choiceNew.setAttribute('aria-pressed', 'false');
            choiceExisting.setAttribute('aria-pressed', 'false');
        }
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
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = item.label;
                const selected = item.workId === selectedWorkId;
                button.classList.toggle('selected', selected);
                button.setAttribute('aria-pressed', selected ? 'true' : 'false');
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
        pauseReplay.disabled = !replay.playing;
        endButton.disabled = !(stats.status === 'recording' || stats.status === 'paused');
        saveButton.disabled = !(stats.status === 'recording' || stats.status === 'paused' || stats.pending > 0);
        switchButton.disabled = false;
        timeline.disabled = replay.durationMs <= 0;
        timeline.max = String(Math.max(1, replay.durationMs));
        if (!timeline.matches(':active')) {
            timeline.value = String(Math.min(replay.timeMs, Number(timeline.max)));
        }
        timeEl.textContent = formatReplay(replay.timeMs);
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
        root.classList.remove('studio');
        root.classList.remove('files');
        gate.hidden = false;
        setGateOpen(true);
        renderExisting();
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
        renderExisting();
        actions.onAuthor(authorInput.value.trim());
    });
    choiceNew.addEventListener('click', () => {
        workIdInput.value = '';
        selectedWorkId = '';
        actions.onCreate();
    });
    choiceExisting.addEventListener('click', () => {
        if (!selectedWorkId) {
            setStatus('先选中一个历史作品。', 'error');
            return;
        }
        actions.onOpenWork();
    });
    backBtn.addEventListener('click', enterStudio);
    restButton.addEventListener('click', actions.onPause);
    resumePaintButton.addEventListener('click', () => actions.onResumePaint());
    watchButton.addEventListener('click', () => actions.onWatch());
    pauseReplay.addEventListener('click', actions.onPauseReplay);
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

    document.body.append(gate, root);
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
        getSpeed: () => Number(speed.value) || 1,
        setReplayUi: (ui) => {
            replay = ui;
            paint();
        },
        collapse: enterStudio,
        showGate,
    };
}
