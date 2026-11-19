import { getIconSvg, getIconUrl } from '../../../icon/icon';
import { BB } from '../../../bb/bb';
import klecksLogoImg from 'url:/src/app/img/klecks-logo.png';
import { LANG } from '../../../language/language';
import { PointerListener } from '../../../bb/input/pointer-listener';

const exportImg = getIconUrl('export');
const swapImg = getIconUrl('ui-swap-lr');

/**
 * Topmost header bar in toolspace (non-navigating brand badge + export, layout flip, help).
 * Upstream ./home/, import, and system share buttons are hidden.
 */
export class ToolspaceTopRow {
    private readonly rootEl: HTMLElement;

    // ----------------------------------- public -----------------------------------
    constructor(p: {
        logoImg?: string;
        onLogo?: () => void;
        onNew?: () => void;
        onImport?: () => void;
        onSave: () => void;
        onShare?: () => void;
        onLeftRight?: () => void;
        onHelp: () => void;
    }) {
        this.rootEl = BB.el({
            className: 'kl-toolspace-row kl-top-header',
        });

        const brandEl = BB.el({
            className: 'kl-top-header__brand',
            title: 'Klecks',
        });
        const brandIcon = BB.el({
            className: 'dark-invert kl-top-header__logo',
            id: 'kl-logo-button-im',
            css: {
                backgroundImage: "url('" + (p.logoImg ?? klecksLogoImg) + "')",
            },
        });
        brandEl.append(brandIcon);

        const actionsEl = BB.el({
            className: 'kl-top-header__actions',
        });

        const createActionButton = (opts: {
            onClick: () => void;
            title: string;
            image?: string;
            content?: HTMLElement | SVGSVGElement;
            label?: string;
        }): HTMLElement => {
            const el = BB.el({
                tagName: 'button',
                className: 'kl-top-header__btn nohighlight',
                title: opts.title,
                onClick: opts.onClick,
                props: {
                    type: 'button',
                    tabIndex: -1,
                },
            });
            if (opts.content) {
                el.append(opts.content);
            } else if (opts.image) {
                const im = BB.el({
                    tagName: 'img',
                    props: {
                        src: opts.image,
                        alt: '',
                    },
                    css: {
                        width: 16,
                        height: 16,
                        pointerEvents: 'none',
                    },
                });
                el.append(im);
            }
            if (opts.label) {
                el.append(
                    BB.el({
                        tagName: 'span',
                        textContent: opts.label,
                    }),
                );
            }
            new BB.PointerListener({
                target: el,
                onEnterLeave: (isOver) => {
                    el.classList.toggle('kl-top-header__btn--hover', isOver);
                },
            });
            return el;
        };

        const saveButton = createActionButton({
            onClick: p.onSave,
            title: `${LANG('file-save')} [Ctrl+S]`,
            image: exportImg,
            label: LANG('file-save'),
        });
        actionsEl.append(saveButton);

        if (p.onLeftRight) {
            const swapButton = createActionButton({
                onClick: p.onLeftRight,
                title: LANG('switch-ui-left-right'),
                image: swapImg,
            });
            actionsEl.append(swapButton);
        }

        const helpButton = createActionButton({
            onClick: p.onHelp,
            title: LANG('help'),
            content: getIconSvg('help', {
                width: 16,
                height: 16,
            }),
        });
        actionsEl.append(helpButton);

        this.rootEl.append(brandEl, actionsEl);
    }

    setLogo(logoImg: string, isPixelated?: boolean, keepOriginalColors?: boolean): void {
        const el = document.getElementById('kl-logo-button-im');
        if (el) {
            el.style.backgroundImage = "url('" + logoImg + "')";
            el.style.imageRendering = isPixelated ? 'pixelated' : '';
            el.classList.toggle('dark-invert', !keepOriginalColors);
        }
    }

    getElement(): HTMLElement {
        return this.rootEl;
    }
}
