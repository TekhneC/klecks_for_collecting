import { BB } from '../../../bb/bb';
import { PointerListener } from '../../../bb/input/pointer-listener';
import { css } from '../../../bb/base/base';

/**
 * A slider that looks like this
 * ------O----
 */
export class PointSlider {
    private readonly rootEl: HTMLElement;
    private readonly sliderLine: HTMLElement;
    private readonly sliderPoint: HTMLElement;
    private readonly pointerListener: PointerListener;
    private width: number;
    private readonly pointSize: number;
    private sliderPos: number;
    private readonly redrawPoint: () => void;

    // ----------------------------------- public -----------------------------------
    constructor(p: {
        init: number;
        width: number;
        pointSize: number;
        callback: (value: number, isFirst: boolean, isLast: boolean) => void;
        // if true, do nothing
        getDoIgnore: () => boolean;
    }) {
        this.width = p.width;
        this.pointSize = p.pointSize;
        this.rootEl = BB.el({
            css: {
                position: 'relative',
            },
        });
        this.sliderLine = BB.el({
            parent: this.rootEl,
            className: 'kl-point-slider__line',
            css: {
                marginTop: parseInt('' + (p.pointSize / 2 - 1)),
                width: this.width,
            },
        });
        this.sliderPoint = BB.el({
            parent: this.rootEl,
            className: 'kl-point-slider__point',
        });

        //sliderPoint
        const touchAreaEl = BB.el({
            // expand clickable area
            parent: this.sliderPoint,
            css: {
                // background: 'rgba(255,0,0,0.4)',
                margin: '-7px 0 0 -7px',
                width: 'calc(100% + 14px)',
                height: 'calc(100% + 7px)',
            },
        });

        this.redrawPoint = () => {
            css(this.sliderPoint, {
                left: this.sliderPos,
            });
        };
        const getValue = () => {
            const span = Math.max(1, this.width - this.pointSize);
            return this.sliderPos / span;
        };

        {
            let isDragging = false;
            let isFirst: boolean;
            this.sliderPos = BB.clamp(
                p.init * (this.width - this.pointSize),
                0,
                this.width - this.pointSize,
            );
            css(this.sliderPoint, {
                width: p.pointSize,
                height: p.pointSize,
                borderRadius: p.pointSize,
            });
            this.redrawPoint();
            let imaginaryPos: number;
            this.pointerListener = new BB.PointerListener({
                target: this.sliderPoint,
                fixScribble: true,
                onPointer: (event): void => {
                    if (
                        event.type === 'pointerdown' &&
                        event.button === 'left' &&
                        !p.getDoIgnore()
                    ) {
                        isFirst = true;
                        isDragging = true;
                        imaginaryPos = this.sliderPos;
                        this.redrawPoint();
                        event.eventStopPropagation();
                    } else if (
                        event.type === 'pointermove' &&
                        event.button === 'left' &&
                        isDragging
                    ) {
                        event.eventStopPropagation();
                        imaginaryPos = imaginaryPos + event.dX;
                        this.sliderPos = parseInt(
                            '' + BB.clamp(imaginaryPos, 0, this.width - this.pointSize),
                        );
                        this.redrawPoint();
                        p.callback(getValue(), isFirst, false);
                        isFirst = false;
                    }
                    if (event.type === 'pointerup' && isDragging) {
                        event.eventStopPropagation();
                        isDragging = false;
                        this.redrawPoint();
                        p.callback(getValue(), false, true);
                    }
                },
            });
        }
    }

    // ---- interface ----

    getElement(): HTMLElement {
        return this.rootEl;
    }

    setWidth(width: number): void {
        width = Math.max(this.pointSize + 10, Math.round(width));
        if (width === this.width) {
            return;
        }
        const oldSpan = Math.max(1, this.width - this.pointSize);
        const value = BB.clamp(this.sliderPos / oldSpan, 0, 1);
        this.width = width;
        this.sliderLine.style.width = width + 'px';
        this.sliderPos = BB.clamp(value * (this.width - this.pointSize), 0, this.width - this.pointSize);
        this.redrawPoint();
    }

    setActive(isActive: boolean): void {
        this.sliderPoint.style.backgroundColor = isActive ? '#fff' : '#eaeaea';
    }

    destroy(): void {
        this.pointerListener.destroy();
    }
}
