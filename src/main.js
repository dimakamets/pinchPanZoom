import './styles/main.scss'


import imgZoom from "./imgZoom";
const  imgForZooming = document.getElementById('zoomedImg');

new imgZoom(imgForZooming, document.getElementById('image-container'), document.getElementById('wrapper'), document.querySelector('.cursor-minus'), document.querySelector('.cursor-plus'),{
    TAP_ZOOM_SCALE: 2,
    MAX_SCALE: 4,
    MIN_SCALE: 1,
    zoomedImgClassName: 'zoomed',
    zoomedSliderClassName: 'zoomedSlider',
    startScale: 1,
})