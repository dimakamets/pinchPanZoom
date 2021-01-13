import Hammer from 'hammerjs';
import $ from "jquery";

const AppConfig = {
    TABLET: 1024,
    MOBILE: 640,
};
import {getPosition} from './helpers'

const initCurEvent = function () {
    return window.innerWidth > AppConfig.TABLET ? 'click' : 'dblclick'
};

class imgZoom {
    constructor(image, slider, viewport, cursorPlus, cursorMinus, settings = {}) {
        if (!this.isNode(image)) {
            return;
        }
        this.image = image;
        this.slider = slider;
        this.viewport = viewport;
        this.DEFAULT_ZOOM_SCALE = 1;
        this.currentZoomScale = this.DEFAULT_ZOOM_SCALE;
        this.startScale = settings.hasOwnProperty('startScale') && settings.startScale || this.DEFAULT_ZOOM_SCALE;
        this.needStartPositionSet = this.startScale !== this.currentZoomScale;
        this.prevScale = this.DEFAULT_ZOOM_SCALE;
        this.TAP_ZOOM_SCALE = settings.hasOwnProperty('TAP_ZOOM_SCALE') && settings.TAP_ZOOM_SCALE || this.DEFAULT_ZOOM_SCALE * 2;
        this.MIN_SCALE = settings.hasOwnProperty('MIN_SCALE') && settings.MIN_SCALE || 1;
        this.MAX_SCALE = settings.hasOwnProperty('MAX_SCALE') && settings.MAX_SCALE || 4;
        this.zoomedImgClassName = settings.hasOwnProperty('zoomedImgClassName') && settings.zoomedImgClassName || 'zoomed';
        this.zoomedSliderClassName = settings.hasOwnProperty('zoomedSliderClassName') && settings.zoomedSliderClassName || 'zoomedSlider';
        this.viewportCenterAttrName = 'data-viewport-center-point';
        this.scaleDuration = 300;//ms
        this.timeout = null;
        this.hammer = null;
        this._isZoomed = this.currentZoomScale !== this.DEFAULT_ZOOM_SCALE;
        this._viewportSize = {
            width: 0,
            height: 0
        };
        this.pointOnImageInViewportCenter = this.image.hasAttribute(this.viewportCenterAttrName) ? JSON.parse(this.image.getAttribute(this.viewportCenterAttrName)) : null;
        this.imgSize = Object.assign({}, this._viewportSize);
        this.curSize = Object.assign({}, this.imgSize);
        this.pinchCenter = null;
        this.startBorders = {
            x: 0,
            y: 0
        };
        this.curTranslate = Object.assign({}, this.startBorders);
        this.border = {
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
        };
        this.curtOffset = Object.assign({}, this.border);
        this.startOffset = Object.assign({}, this.curtOffset);
        this.curX = 0;
        this.curY = 0;
        this.lastTouchStart = null;
        this.pinched = false;
        this.paned = false;
        this.awaitAnimEnd = false;
        this.listeners = {};
        this.eventListCanBeListened = [
            'zoom'
        ];
        this.initTimeout = null;
        this.resizeTimeout = null;
        this.resizeTimeoutRecalcBordersForAll = null;
        this.resizeTimeoutRecalcBordersForZoomed = null;
        this.slideChangeTimeout = null;
        this.pinchendTimeout = null;
        this.panendTimeout = null;
        this.afterTranslateTimeout = null;
        this.afterTranslateTimeoutEnd = null;
        this.recalcBordersAfterTranslateTimeout = null;
        this.awaitSlideChange = false;
        this._imageSize = {
            width: 0,
            height: 0
        }
        this.init();
    }

    init() {
        if (!this.image) {
            return;
        }
        const image = this.image.tagName === 'PICTURE' ? this.image.querySelector('img') : this.image;
        image.addEventListener('load', e => {
            $(window).trigger('resize')
        });
        this.updateStartInfo(true);
        this.disableImgEventHandlers();
        this.addListeners();
        this.initTimeout && clearTimeout(this.initTimeout);
        this.initTimeout = setTimeout(function () {
            if (this.needStartPositionSet) {
                this.zoomAround(Object.assign({}, {
                    center: {
                        x: this.viewportCenter.x,
                        y: this.viewportCenter.y
                    },
                    deltaX: 0,
                    deltaY: 0,
                    scale: this.startScale / this.currentZoomScale
                }), true, null);
                this.afterTranslateEnd();
                this.needStartPositionSet = false;
            } else {
                if (this.image.getAttribute(this.viewportCenterAttrName) !== null) {
                    this.pointOnImageInViewportCenter = JSON.parse(this.image.getAttribute(this.viewportCenterAttrName));
                    this.saveImagePositionRelativeToWindow();
                }
            }
        }.bind(this));
    }

    isNode(o) {
        return (
            typeof Node === "object" ? o instanceof Node :
                o && typeof o === "object" && typeof o.nodeType === "number" && typeof o.nodeName === "string"
        );
    }

    destroy() {
        this.removeListeners();
        this.hammer = null;
    }

    updateStartInfo(getStartOffsetOnParent = false) {

        const oldSize = this.imgSize;
        const scale = oldSize.height ? this.image.clientHeight / oldSize.height : 1;

        this.imgSize = {
            width: this.image && (oldSize.width ? oldSize.width * scale : this.image.clientWidth) || 0,
            height: this.image && (oldSize.height ? oldSize.height * scale : this.image.clientHeight) || 0
        };
        this.curSize = {
            width: this.image && this.imgSize.width * this.currentZoomScale,
            height: this.image && this.imgSize.height * this.currentZoomScale,
        };
        this.startOffset = this.updateOffsets(getStartOffsetOnParent);
        this.updateBorders();
        this.curTranslate = {x: 0, y: 0};
    }

    disableImgEventHandlers() {
        var events = ['onclick', 'onmousedown', 'onmousemove', 'onmouseout', 'onmouseover',
            'onmouseup', 'ondblclick', 'onfocus', 'onblur'];

        events.forEach(function (event) {
            this.image[event] = function () {
                return false;
            };
        }.bind(this));
    };

    isTouch() {
        return window.DocumentTouch && document instanceof window.DocumentTouch ||
            navigator.maxTouchPoints > 0 ||
            window.navigator.msMaxTouchPoints > 0;
    }

    isTablet() {
        return !(window.innerWidth > AppConfig.TABLET);
    }

    isMobile() {
        return !(window.innerWidth > AppConfig.MOBILE);
    }

    restrictScale(newScale) {
        if (newScale < this.MIN_SCALE) {
            return this.MIN_SCALE
        }
        if (newScale > this.MAX_SCALE) {
            return this.MAX_SCALE
        }
        return newScale
    }

    updateBorders() {
        const isImageScaledX = this.curImageSize.width > this.viewportSize.width;
        const isImageScaledY = this.curImageSize.height > this.viewportSize.height;
        const widthDifference = this.viewportSize.width - this.curImageSize.width;
        const heightDifference = this.viewportSize.height - this.curImageSize.height;
        const topOffset = -this.startOffset.top + (this.startOffset.top - (window.innerHeight - this.startOffset.bottom));
        const leftOffset = -this.startOffset.left + (this.startOffset.left - (window.innerWidth - this.startOffset.right));
        const topBorder = isImageScaledY ? topOffset : topOffset + heightDifference / 2,
            bottomBorder = isImageScaledY ? topOffset + heightDifference : topOffset + heightDifference / 2,
            leftBorder = !this.isTablet() ? ((this.imageCenter.x - this.curImageCenter.x)) : isImageScaledX ? leftOffset : leftOffset + widthDifference / 2,
            rightBorder = !this.isTablet() ? leftBorder : isImageScaledX ? leftOffset + widthDifference : leftOffset + widthDifference / 2;
        this.border = {
            left: Math.round(leftBorder / this.currentZoomScale),
            right: Math.round(rightBorder / this.currentZoomScale),
            top: Math.round(topBorder / this.currentZoomScale),
            bottom: Math.round(bottomBorder / this.currentZoomScale),
        };
        return this.border;
    }

    updateOffsets(getStartOffset = false) {

        let offset = (getStartOffset ? this.viewport : this.image).getBoundingClientRect();

        if (getStartOffset) {
            this.curtOffset = {
                top: offset.top + ((this.viewportSize.height - this.imageSize.height) / 2),
                right: offset.right - ((this.viewportSize.width - this.imageSize.width) / 2),
                bottom: offset.bottom - ((this.viewportSize.height - this.imageSize.height) / 2),
                left: offset.left + ((this.viewportSize.width - this.imageSize.width) / 2),
            };
        } else {
            this.curtOffset = {
                top: offset.top,
                right: offset.right,
                bottom: offset.bottom,
                left: offset.left,
            };
        }

        return this.curtOffset;

    }

    zoom(scaleBy) {
        this.currentZoomScale = this.restrictScale(this.prevScale * scaleBy);
        this.isZoomed = this.currentZoomScale !== this.DEFAULT_ZOOM_SCALE;
        this.curSize.width = this.imgSize.width * this.currentZoomScale;
        this.curSize.height = this.imgSize.height * this.currentZoomScale;
    }

    translate(delta, useBorders = false) {
        let dx = this.curTranslate.x + delta.x;
        let dy = this.curTranslate.y + delta.y;
        if (useBorders) {
            this.curX = Math.min(Math.max(dx, this.border.right), this.border.left);
            this.curY = Math.min(Math.max(dy, this.border.bottom), this.border.top);
        } else {
            this.updateBorders();
            this.curX = dx;
            this.curY = dy;
        }
        this.image.style.transform = `scale(${this.currentZoomScale}) translate(${this.curX}px,${this.curY}px)`;
    }

    calcCenterViewportPointOnImage() {
        this.pointOnImageInViewportCenter = {
            x: (-(this.curTranslate.x * this.currentZoomScale) - this.startOffset.left + (this.viewportSize.width / 2)) / this.curImageSize.width,
            y: (-(this.curTranslate.y * this.currentZoomScale) - this.startOffset.top + (this.viewportSize.height / 2)) / this.curImageSize.height,
        };
        this.image.setAttribute(this.viewportCenterAttrName, JSON.stringify(this.pointOnImageInViewportCenter));
    }

    saveImagePositionRelativeToWindow() {
        this.curX = 0;
        this.curY = 0;
        this.curTranslate = {
            x: 0,
            y: 0
        };

        const startViewportCenterPointOnImage = {
            x: this.viewportCenter.x - (this.startOffset.left),
            y: this.viewportCenter.y - (this.startOffset.top)
        };
        const finishViewportCenterPoint = {
            x: this.curSize.width * this.pointOnImageInViewportCenter.x,
            y: this.curSize.height * this.pointOnImageInViewportCenter.y
        };
        const deltaTranslate = {
            x: (startViewportCenterPointOnImage.x - finishViewportCenterPoint.x) / this.currentZoomScale,
            y: (startViewportCenterPointOnImage.y - finishViewportCenterPoint.y) / this.currentZoomScale
        };

        this.image.classList.add('pinched');
        this.image.classList.add(this.zoomedImgClassName);
        this.zoomAround(Object.assign({}, {
            center: {
                x: 0,
                y: 0
            },
            deltaX: 0,
            deltaY: 0,
            scale: this.DEFAULT_ZOOM_SCALE
        }), true, deltaTranslate, true);
        this.pinchCenter = null;
        this.updateBorders();
        this.afterTranslateEnd()
        this.recalcBordersAfterTranslateTimeout && clearTimeout(this.recalcBordersAfterTranslateTimeout);
        this.recalcBordersAfterTranslateTimeout = setTimeout(function () {
            this.updateBorders();
            this.startOffset = this.updateOffsets(true)
            this.recalcBordersAfterTranslateTimeout = null;
        }.bind(this), this.scaleDuration / 1.5)


    }

    calcPinchCenter(center) {
        return {
            x: center.x - this.startOffset.left,
            y: center.y - this.startOffset.top
        }
    }

    updateLastScaleData(removeClasses = false) {
        this.pinchCenter = null;
        if (!removeClasses) {
            this.prevScale = this.currentZoomScale;
        }
        this.curTranslate = {
            x: this.curX,
            y: this.curY,
        };
        this.curX = 0;
        this.curY = 0;
        if (removeClasses) {
            this.image.classList.remove('pinched');
            this.image.classList.remove(this.zoomedImgClassName);
        }
    }

    zoomAround(e, disableAnimation = true, deltaValue = null, useSetDelta = false) {
        if (this.pinchCenter === null) {
            this.pinchCenter = this.calcPinchCenter(e.center);
        }
        this.zoom(e.scale);
        if (disableAnimation) {
            this.image.classList.add('pinched');
            this.image.classList[this.isZoomed ? 'add' : 'remove'](this.zoomedImgClassName);
        }
        let delta = {
            x: -(((this.pinchCenter.x + e.deltaX) * (this.currentZoomScale - this.prevScale)) / this.currentZoomScale / this.prevScale),
            y: -(((this.pinchCenter.y + e.deltaY) * (this.currentZoomScale - this.prevScale)) / this.currentZoomScale / this.prevScale),
        };
        if (useSetDelta && typeof deltaValue === 'object' && deltaValue.hasOwnProperty('x') && deltaValue.hasOwnProperty('y') && typeof deltaValue.x === 'number' && typeof deltaValue.y === 'number') {
            delta = deltaValue;
        }
        this.translate(delta)
    }

    isDoubleTap(event) {
        let fingers = event.touches.length;
        var time = (new Date()).getTime();
        if (fingers > 1) {
            this.lastTouchStart = null;
        }
        if (time - this.lastTouchStart < 300) {
            event.stopPropagation();
            event.preventDefault();
            return true;
        }

        if (fingers === 1) {
            this.lastTouchStart = time;
            return false;
        }
    };

    afterTranslateEnd(clearValuesBeforeSetBordersTranslate = false) {
        if (this.awaitAnimEnd) {
            return
        }
        this.awaitAnimEnd = true;
        if (clearValuesBeforeSetBordersTranslate) {
            this.curTranslate = {
                x: 0,
                y: 0
            };
            this.curX = 0;
            this.curY = 0;
        }

        this.updateLastScaleData(true);
        this.afterTranslateTimeout && clearTimeout(this.afterTranslateTimeout);
        this.afterTranslateTimeout = setTimeout(() => {
            this.translate({x: 0, y: 0}, true);
            this.updateLastScaleData(false)
            this.calcCenterViewportPointOnImage();
            this.afterTranslateTimeoutEnd && clearTimeout(this.afterTranslateTimeoutEnd);
            this.afterTranslateTimeoutEnd = setTimeout(() => {
                this.awaitAnimEnd = false;
                this.pinchCenter = null;
                this.afterTranslateTimeoutEnd = null;
            }, this.scaleDuration);
            this.afterTranslateTimeout = null;
        }, 0)
    }

    removeListeners() {
        this.hammer && this.hammer.off('pinch');
        this.hammer && this.hammer.off('pan');
        this.hammer && this.hammer.off('panend');
        this.hammer && this.hammer.off('pinchend');
        $(this.image).off('touchstart');
        $(this.image).off('touchmove');
        // $(this.slider).off('slideChanged');
        // $(this.slider).off('slideChangeStarted');
        // $(this.slider).off('windowResized');
        $(window).off('resize');
    }

    disableZoom() {
        this.zoomAround(Object.assign({}, {
            center: {
                x: this.windowCenter.x,
                y: this.windowCenter.y
            },
            deltaX: 0,
            deltaY: 0,
            scale: (this.DEFAULT_ZOOM_SCALE) / this.currentZoomScale
        }), false);
        this.afterTranslateEnd(!this.isZoomed);
    }

    addListeners() {
        this.hammer = new Hammer(this.image.parentElement, {
            domEvents: true
        });

        this.hammer.get('pinch').set({
            enable: true
        });

        this.hammer.on('pan', function (e) {
            if (!this.isTablet() || !this.isZoomed || this.awaitSlideChange || this.awaitAnimEnd || this.pinched) {
                return
            }
            this.paned = true;
            this.image.classList.add(this.zoomedImgClassName);
            this.translate({x: e.deltaX / this.currentZoomScale, y: e.deltaY / this.currentZoomScale})

        }.bind(this));

        $(this.image).on('click', function (e) {
            if (this.isTablet() || this.isTouch() || this.awaitAnimEnd || this.awaitSlideChange) {
                return;
            }
            this.zoomAround(Object.assign({}, e, {
                center: {
                    x: this.windowCenter.x,
                    y: e.clientY
                },
                deltaX: 0,
                deltaY: 0,
                scale: (this.isZoomed ? this.DEFAULT_ZOOM_SCALE : this.TAP_ZOOM_SCALE) / this.currentZoomScale
            }), false);
            this.afterTranslateEnd(!this.isZoomed);
            console.log(this)
        }.bind(this));

        $(this.image).on('mousemove', function (e) {
            console.log('aa')
            if (this.isTablet() || this.isTouch() || this.awaitAnimEnd || !this.isZoomed || this.awaitSlideChange) {

                return;
            }
            if (this.curSize.height > this.viewportSize.height) {
                this.image.classList.add('zoomed')
                let sizeRatio = (this.curSize.height - this.viewportSize.height) / this.viewportSize.height;
                let mouseRelativeCoord = e.clientY - getPosition(this.viewport).y
                let position = ((mouseRelativeCoord * (sizeRatio / this.currentZoomScale))) * -1;
                this.curY = position;
                this.curX = this.curTranslate.x;
                this.translate({
                    x: 0,
                    y: -(this.curTranslate.y - position)
                })
            }

        }.bind(this));
        $(this.image).on('touchstart', function (e) {
            if (!this.isDoubleTap(e) || this.awaitSlideChange || this.awaitAnimEnd) {
                !this.awaitSlideChange && (e.preventDefault());
                return
            }
            this.lastTouchStart = null;
            this.zoomAround(Object.assign({}, e, {
                center: {
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY
                },
                deltaX: 0,
                deltaY: 0,
                scale: (this.isZoomed ? this.DEFAULT_ZOOM_SCALE : this.TAP_ZOOM_SCALE) / this.currentZoomScale
            }), false);
            this.afterTranslateEnd(!this.isZoomed);
        }.bind(this));
        $(this.image).on('touchmove', (e) => {
            if (this.isZoomed || this.awaitAnimEnd) {
                e.stopPropagation();
            }
        });

        this.hammer.on('panend', function (e) {
            if (!this.isTablet() || !this.isZoomed || this.awaitSlideChange || this.awaitAnimEnd || this.pinched) {
                return
            }
            this.paned = false;
            this.panendTimeout && clearTimeout(this.panendTimeout);
            this.panendTimeout = setTimeout(() => {
                this.pinched = false;
                this.panendTimeout = null;
            }, this.scaleDuration / 2);
            this.afterTranslateEnd();
        }.bind(this));

        this.hammer.on('pinch', function (e) {
            if (!this.isTablet() || this.awaitSlideChange || this.paned) {
                return;
            }
            this.pinched = true;
            this.zoomAround(e)

        }.bind(this));


        this.hammer.on('pinchend', function (e) {

            if (!this.isTablet() || this.awaitSlideChange || this.paned) {
                return;
            }
            this.pinchendTimeout && clearTimeout(this.pinchendTimeout);
            this.pinchendTimeout = setTimeout(() => {
                this.pinched = false;
            }, this.scaleDuration / 2);
            this.pinchendTimeout = null;
            this.afterTranslateEnd();
        }.bind(this));

        // $(this.slider).on('slideChanged', () => {
        //     this.slideChangeTimeout && clearTimeout(this.slideChangeTimeout);
        //     this.slideChangeTimeout = setTimeout(function () {
        //         this.awaitSlideChange = false;
        //         this.slideChangeTimeout = null;
        //     }.bind(this), 0)
        //
        // });
        // $(this.slider).on('slideChangeStarted', () => {
        //     this.awaitSlideChange = true;
        //     if (this.isZoomed) {
        //         this.disableZoom()
        //     }
        // });
        $(window).on('resize', function (e) {
            this.resizeTimeout && clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => {
                if (!this.isZoomed) {
                    this.resizeTimeoutRecalcBordersForAll && clearTimeout(this.resizeTimeoutRecalcBordersForAll);
                    this.resizeTimeoutRecalcBordersForAll = setTimeout(() => {
                        this.updateStartInfo(true);
                        this.resizeTimeoutRecalcBordersForAll = null;
                    }, 0);
                    return;
                }
                this.resizeTimeoutRecalcBordersForZoomed && clearTimeout(this.resizeTimeoutRecalcBordersForZoomed);
                this.resizeTimeoutRecalcBordersForZoomed = setTimeout(() => {
                    this.updateStartInfo(true);
                    this.saveImagePositionRelativeToWindow();
                    this.resizeTimeoutRecalcBordersForZoomed = null;
                }, 0)
            }, 150)
        }.bind(this))
    }

    get viewportCenter() {
        return {
            x: this._viewportSize.width / 2,
            y: this._viewportSize.height / 2
        }
    }


    get viewportSize() {
        this._viewportSize = {
            width: this.viewport && this.viewport.clientWidth || 0,
            height: this.viewport && this.viewport.clientHeight || 0
        }
        return this._viewportSize;
    }

    get windowCenter() {
        return {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        }
    }

    get imageCenter() {
        return {
            x: this._imageSize.width / 2,
            y: this._imageSize.height / 2
        }
    }

    get curImageSize() {
        return {
            width: this._imageSize.width * this.currentZoomScale,
            height: this._imageSize.height * this.currentZoomScale
        }
    }

    get imageSize() {
        this._imageSize = {
            width: this.image.clientWidth,
            height: this.image.clientHeight
        };
        return this._imageSize
    }

    get curImageCenter() {
        return {
            x: this.curSize.width / 2,
            y: this.curSize.height / 2
        }
    }

    get isZoomed() {
        return this._isZoomed
    }

    set isZoomed(val) {
        this._isZoomed = val;
        this.slider.classList[val ? 'add' : 'remove'](this.zoomedSliderClassName);
        this.listeners.zoom && Array.isArray(this.listeners.zoom) && (this.listeners.zoom.forEach((callback) => {
            callback.call(null, val)
        }))
    }

    on(eventToListen, callbackFunc) {
        if (!this.canListenThisEvent(eventToListen)) {
            return
        }
        if (!this.listeners.hasOwnProperty(eventToListen)) {
            this.listeners[eventToListen] = [];
        }
        callbackFunc && typeof callbackFunc === 'function' && this.listeners[eventToListen].push(callbackFunc);
    }

    canListenThisEvent(eventName) {
        return this.eventListCanBeListened.includes(eventName)
    }
}

export default imgZoom