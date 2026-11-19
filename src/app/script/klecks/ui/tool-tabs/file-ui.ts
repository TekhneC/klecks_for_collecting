import { SelectCustom } from '../components/select-custom';
import { getIconUrl } from '../../../icon/icon';
import { BB } from '../../../bb/bb';
import { TDropOption, TExportType, TKlProject } from '../../kl-types';
import { ProjectStore } from '../../storage/project-store';
import { LANG } from '../../../language/language';
import { Checkbox } from '../components/checkbox';
import { LocalStorage } from '../../../bb/base/local-storage';
import { KlRecoveryManager } from '../../storage/kl-recovery-manager';

const exportImg = getIconUrl('export');
const LS_SHOW_SAVE_DIALOG = 'kl-save-dialog';

export type TFileUiParams = {
    klRootEl: HTMLElement;
    helpPath: string;
    projectStore?: ProjectStore;
    getProject: () => TKlProject;
    exportType: TExportType;
    onExportTypeChange: (type: TExportType) => void;
    onFileSelect: (fileList: FileList, optionStr: TDropOption) => void;
    onSaveImageToComputer: () => void;
    onNewImage: () => void;
    onShareImage: (callback: () => void) => void;
    onUpload: () => void;
    applyUncommitted: () => void;
    onChangeShowSaveDialog: (b: boolean) => void;
    klRecoveryManager?: KlRecoveryManager;
    onOpenBrowserStorage: () => void;
    onStoredToBrowserStorage: () => void;
};

/**
 * Artwork export panel. Upstream import, browser storage, tab recovery,
 * Imgur upload, and system share entries are hidden for the capture fork.
 */
export class FileUi {
    private exportType: TExportType;
    private readonly rootEl: HTMLDivElement;

    // ----------------------------------- public -----------------------------------

    constructor(p: TFileUiParams) {
        this.exportType = p.exportType;
        this.rootEl = document.createElement('div');

        const asyncCreation = (): void => {
            const card = BB.el({
                className: 'kl-panel-card',
                css: {
                    margin: '8px 8px 0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                },
            });

            const header = BB.el({
                className: 'kl-panel-card__title',
                textContent: LANG('file-save'),
            });

            const hint = BB.el({
                className: 'kl-panel-card__hint',
                textContent: `${LANG('file-format')}: PNG / JPG / PSD / ${LANG('layers')}`,
            });

            const saveButton = BB.el({
                tagName: 'button',
                className: 'kl-button kl-button-primary',
                content: [
                    BB.el({
                        tagName: 'img',
                        props: {
                            src: exportImg,
                            alt: '',
                            height: 16,
                        },
                        css: {
                            filter: 'brightness(0) invert(1)',
                        },
                    }),
                    LANG('file-save'),
                ],
                css: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    fontWeight: 500,
                },
                props: {
                    tabIndex: -1,
                },
                onClick: () => p.onSaveImageToComputer(),
            });

            const exportTypeSelect = new SelectCustom({
                optionArr: [
                    ['png', 'PNG'],
                    ['jpg', 'JPG'],
                    ['psd', 'PSD'],
                    ['layers', LANG('layers') + ' (PNG)'],
                ],
                initValue: this.exportType,
                onChange: (val) => {
                    this.exportType = val as TExportType;
                    p.onExportTypeChange(this.exportType);
                },
                title: LANG('file-format'),
                name: 'export-type',
            });

            const actionsRow = BB.el({
                content: [saveButton, exportTypeSelect.getElement()],
                css: {
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    gap: 8,
                },
            });

            card.append(header, hint, actionsRow);

            const canShowSaveDialog = 'showSaveFilePicker' in window;
            const showSaveDialogRaw = LocalStorage.getItem(LS_SHOW_SAVE_DIALOG);
            const initialShowSaveDialog =
                showSaveDialogRaw === null ? false : showSaveDialogRaw === 'true';
            p.onChangeShowSaveDialog(initialShowSaveDialog);

            if (canShowSaveDialog) {
                const saveDialogCheckbox = new Checkbox({
                    init: initialShowSaveDialog,
                    label: LANG('file-show-save-dialog'),
                    callback: (value) => {
                        if (value) {
                            LocalStorage.setItem(LS_SHOW_SAVE_DIALOG, 'true');
                        } else {
                            LocalStorage.removeItem(LS_SHOW_SAVE_DIALOG);
                        }
                        p.onChangeShowSaveDialog(value);
                    },
                    css: {
                        maxWidth: 'fit-content',
                    },
                    name: 'show-save-dialog',
                });
                card.append(saveDialogCheckbox.getElement());
            }

            this.rootEl.append(card);
        };

        setTimeout(asyncCreation, 1);
    }

    refresh(): void {}

    getElement(): HTMLElement {
        return this.rootEl;
    }

    setIsVisible(_isVisible: boolean): void {}

    triggerImport(): void {}
}
