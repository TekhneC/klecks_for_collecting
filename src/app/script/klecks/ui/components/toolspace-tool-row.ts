import { getIconSvg, getIconUrl, IconName } from '../../../icon/icon';
import { BB } from '../../../bb/bb';
import { LANG } from '../../../language/language';
import { TToolType } from '../../kl-types';

const toolHandImg = getIconUrl('tool-hand');
const toolZoomInImg = getIconUrl('tool-zoom-in');
const toolZoomOutImg = getIconUrl('tool-zoom-out');
const toolUndoImg = getIconUrl('tool-undo');
const viewportResetImg = getIconUrl('viewport-reset');
const toolPaintImg = getIconUrl('tool-paint');
const toolFillImg = getIconUrl('tool-fill');
const toolGradientImg = getIconUrl('tool-gradient');
const toolTextImg = getIconUrl('tool-text');
const toolShapeImg = getIconUrl('tool-shape');
const toolSelectImg = getIconUrl('tool-select');

type TToolSlotId = TToolType | 'eraser';

type TToolGridItem = {
    id: TToolSlotId;
    el: HTMLButtonElement;
};

/**
 * Modern flat action bar (Undo/Redo, Zoom-/Fit/Zoom+) + direct 4x2 tool grid.
 * Replaces the hidden ToolDropdown and diagonal SVG triangle buttons.
 */
export class ToolspaceToolRow {
    private readonly rootEl: HTMLElement;
    private readonly utilRowEl: HTMLElement;
    private readonly gridEl: HTMLElement;
    private readonly zoomInButton: HTMLButtonElement;
    private readonly zoomOutButton: HTMLButtonElement;
    private readonly fitButton: HTMLButtonElement | undefined;
    private readonly undoButton: HTMLButtonElement;
    private readonly redoButton: HTMLButtonElement;
    private readonly toolButtons: TToolGridItem[] = [];
    private currentActiveStr: TToolType = 'brush';
    private isEraserActive: boolean = false;
    private readonly onActivate: (activeStr: TToolType) => void;
    private readonly onActivateEraser?: () => void;

    private syncActiveHighlight(): void {
        const visualActive: TToolSlotId =
            this.currentActiveStr === 'brush' && this.isEraserActive
                ? 'eraser'
                : this.currentActiveStr;
        for (const item of this.toolButtons) {
            const isActive = item.id === visualActive;
            item.el.classList.toggle('kl-tool-grid__btn--active', isActive);
            item.el.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        }
    }

    // ----------------------------------- public -----------------------------------

    constructor(p: {
        onActivate: (activeStr: TToolType) => void;
        onActivateEraser?: () => void;
        onZoomIn: () => void;
        onZoomOut: () => void;
        onFit?: () => void;
        onUndo: () => void;
        onRedo: () => void;
    }) {
        this.onActivate = p.onActivate;
        this.onActivateEraser = p.onActivateEraser;

        this.rootEl = BB.el({
            className: 'kl-tool-dock',
        });

        this.utilRowEl = BB.el({
            className: 'kl-tool-util-row',
        });

        const createUtilBtn = (opts: {
            onClick: () => void;
            title: string;
            image: string;
            doMirror?: boolean;
            disabled?: boolean;
        }): HTMLButtonElement => {
            const btn = BB.el({
                tagName: 'button',
                className: 'kl-tool-util-btn nohighlight',
                title: opts.title,
                onClick: opts.onClick,
                props: {
                    type: 'button',
                    tabIndex: -1,
                },
            }) as HTMLButtonElement;
            const im = BB.el({
                className: 'dark-invert kl-tool-util-btn__icon',
                css: {
                    backgroundImage: "url('" + opts.image + "')",
                    transform: opts.doMirror ? 'scale(-1, 1)' : '',
                },
            });
            btn.append(im);
            if (opts.disabled) {
                btn.classList.add('toolspace-row-button-disabled');
            }
            new BB.PointerListener({
                target: btn,
                onEnterLeave: (isOver) => {
                    btn.classList.toggle('kl-tool-util-btn--hover', isOver);
                },
            });
            return btn;
        };

        this.undoButton = createUtilBtn({
            onClick: p.onUndo,
            title: `${LANG('undo')} [Ctrl+Z]`,
            image: toolUndoImg,
            disabled: true,
        });
        this.redoButton = createUtilBtn({
            onClick: p.onRedo,
            title: `${LANG('redo')} [Ctrl+Y]`,
            image: toolUndoImg,
            doMirror: true,
            disabled: true,
        });
        this.zoomOutButton = createUtilBtn({
            onClick: p.onZoomOut,
            title: LANG('zoom-out'),
            image: toolZoomOutImg,
        });
        this.zoomInButton = createUtilBtn({
            onClick: p.onZoomIn,
            title: LANG('zoom-in'),
            image: toolZoomInImg,
        });

        this.utilRowEl.append(this.undoButton, this.redoButton);
        this.utilRowEl.append(BB.el({ className: 'kl-tool-util-sep' }));
        this.utilRowEl.append(this.zoomOutButton);
        if (p.onFit) {
            this.fitButton = createUtilBtn({
                onClick: p.onFit,
                title: `${LANG('hand-fit')} [Home]`,
                image: viewportResetImg,
            });
            this.utilRowEl.append(this.fitButton);
        }
        this.utilRowEl.append(this.zoomInButton);

        this.gridEl = BB.el({
            className: 'kl-tool-grid',
        });

        const addToolBtn = (opts: {
            id: TToolSlotId;
            label: string;
            title: string;
            image?: string;
            svgIcon?: IconName;
            onClick: () => void;
        }) => {
            const btn = BB.el({
                tagName: 'button',
                className: 'kl-tool-grid__btn nohighlight',
                title: opts.title,
                onClick: opts.onClick,
                props: {
                    type: 'button',
                    tabIndex: -1,
                },
            }) as HTMLButtonElement;

            if (opts.svgIcon) {
                btn.append(
                    getIconSvg(opts.svgIcon, {
                        width: 17,
                        height: 17,
                        pointerEvents: 'none',
                    }),
                );
            } else if (opts.image) {
                btn.append(
                    BB.el({
                        className: 'dark-invert kl-tool-grid__icon',
                        css: {
                            backgroundImage: "url('" + opts.image + "')",
                        },
                    }),
                );
            }
            btn.append(
                BB.el({
                    tagName: 'span',
                    className: 'kl-tool-grid__label',
                    textContent: opts.label,
                }),
            );

            new BB.PointerListener({
                target: btn,
                onEnterLeave: (isOver) => {
                    btn.classList.toggle('kl-tool-grid__btn--hover', isOver);
                },
            });

            this.toolButtons.push({ id: opts.id, el: btn });
            this.gridEl.append(btn);
        };

        addToolBtn({
            id: 'brush',
            label: LANG('tool-brush'),
            title: `${LANG('tool-brush')} [B]`,
            image: toolPaintImg,
            onClick: () => {
                this.isEraserActive = false;
                this.currentActiveStr = 'brush';
                this.syncActiveHighlight();
                this.onActivate('brush');
            },
        });
        addToolBtn({
            id: 'eraser',
            label: LANG('eraser'),
            title: `${LANG('eraser')} [E]`,
            svgIcon: 'brush-eraser',
            onClick: () => {
                this.isEraserActive = true;
                this.currentActiveStr = 'brush';
                this.syncActiveHighlight();
                if (this.onActivateEraser) {
                    this.onActivateEraser();
                } else {
                    this.onActivate('brush');
                }
            },
        });
        addToolBtn({
            id: 'paintBucket',
            label: LANG('tool-paint-bucket'),
            title: `${LANG('tool-paint-bucket')} [G]`,
            image: toolFillImg,
            onClick: () => this.setActive('paintBucket', true),
        });
        addToolBtn({
            id: 'gradient',
            label: LANG('tool-gradient'),
            title: `${LANG('tool-gradient')} [G]`,
            image: toolGradientImg,
            onClick: () => this.setActive('gradient', true),
        });
        addToolBtn({
            id: 'select',
            label: LANG('tool-select'),
            title: `${LANG('tool-select')} [L]`,
            image: toolSelectImg,
            onClick: () => this.setActive('select', true),
        });
        addToolBtn({
            id: 'shape',
            label: LANG('tool-shape'),
            title: `${LANG('tool-shape')} [U]`,
            image: toolShapeImg,
            onClick: () => this.setActive('shape', true),
        });
        addToolBtn({
            id: 'text',
            label: LANG('tool-text'),
            title: `${LANG('tool-text')} [T]`,
            image: toolTextImg,
            onClick: () => this.setActive('text', true),
        });
        addToolBtn({
            id: 'hand',
            label: LANG('tool-hand'),
            title: `${LANG('tool-hand')} [H]`,
            image: toolHandImg,
            onClick: () => this.setActive('hand', true),
        });

        this.rootEl.append(this.utilRowEl, this.gridEl);
        this.syncActiveHighlight();
    }

    // ---- interface ----

    getElement(): HTMLElement {
        return this.rootEl;
    }

    setIsSmall(b: boolean): void {
        this.rootEl.classList.toggle('kl-tool-dock--compact', b);
    }

    setEnableZoomIn(b: boolean): void {
        this.zoomInButton.classList.toggle('toolspace-row-button-disabled', !b);
    }

    setEnableZoomOut(b: boolean): void {
        this.zoomOutButton.classList.toggle('toolspace-row-button-disabled', !b);
    }

    setEnableUndo(b: boolean): void {
        this.undoButton.classList.toggle('toolspace-row-button-disabled', !b);
    }

    setEnableRedo(b: boolean): void {
        this.redoButton.classList.toggle('toolspace-row-button-disabled', !b);
    }

    setIsEraserActive(isEraser: boolean): void {
        if (this.isEraserActive === isEraser) {
            return;
        }
        this.isEraserActive = isEraser;
        this.syncActiveHighlight();
    }

    setActive(activeStr: TToolType, doEmit?: boolean): void {
        this.currentActiveStr = activeStr;
        if (activeStr !== 'brush') {
            this.isEraserActive = false;
        }
        this.syncActiveHighlight();

        if (doEmit) {
            this.onActivate(this.currentActiveStr);
        }
    }

    getActive(): TToolType {
        return this.currentActiveStr;
    }
}
