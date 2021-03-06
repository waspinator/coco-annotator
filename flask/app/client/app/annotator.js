define(['Vue', 'paper', 'axios', 'tools', 'category', 'toolPanel', 'asyncStatus'],
    function (Vue, paper, axios, tools) {

    let app = new Vue({
        el: '#app',
        data: {
            loadingMessage: '',
            api: '',
            paper: null,
            mouseDown: false,
            activeTool: 'Select',
            zoom: 0.2,
            hoverData: true,
            shapeOpacity: 0.5,
            polygon: {
                toggleGuidance: null,
                deleteCurrent: null,
                completeDistance: 5,
                path: null,
                guidance: true,
                simplify: 1,
                pathOptions: {
                    strokeColor: 'black',
                    strokeWidth: 1
                }
            },
            wand: {
                threshold: 15,
                blur: 5,
                simplify: 5,
            },
            eraser: {
                brush: null,
                minimumArea: 10,
                simplify: 5,
                pathOptions: {
                    strokeColor: 'white',
                    strokeWidth: 1,
                    radius: 30,
                }
            },
            current: {
                category: -1,
                annotation: -1,
            },
            hover: {
                category: -1,
                annotation: -1,
                text: null,
                fontSize: 1,
            },
            panels: {
                right: {
                    show: true
                },
                left: {
                    show: true
                }
            },
            categories: [],
            dataset: {},
            image: {
                ratio: 0,
                rotate: 0,
                id: null,
                url: '',
                filename: '',
                metadata: {},
                categories: [],
                dataset: 0,
                previous: null,
                next: null,
            },
            keys: {
                ctrl: false,
                shift: false,
            },
            status: {
                saving: {state: true, message: 'Saving data'},
                downloading: {state: true, message: 'Download annotations'},
                image: {state: true , message: 'Loading image'},
                data: {state: true, message: 'Initializing data'},
            },
        },
        methods: {
            onkeydown: function (e) {

                if (e.target.tagName.toLowerCase() === "input") return;
                if (e.target.tagName.toLowerCase() === "textarea") return;

                if (e.key.toLowerCase() === "control") this.keys.ctrl = true;
                if (e.key.toLowerCase() === "shift") this.keys.shift = true;

                // Action shortcuts
                if (e.key.toLowerCase() === "s" && this.keys.ctrl) this.save(() => {this.activeTool = activeTool});
                if (e.key.toLowerCase() === "d" && this.keys.ctrl) this.downloadCoco();
                if (e.key.toLowerCase() === "r" && this.keys.ctrl) location.reload();

                // Tool shortcuts
                if (e.key.toLowerCase() === "w") this.activeTool = "Wand";
                if (e.key.toLowerCase() === "p") this.activeTool = "Polygon";
                if (e.key.toLowerCase() === "s") this.activeTool = "Select";
                if (e.key.toLowerCase() === "e") this.activeTool = "Eraser";
                if (e.key.toLowerCase() === "c") this.fit();

                if (this.activeTool.toLowerCase() === "polygon") {
                    if (e.key.toLowerCase() === "delete") {
                        this.polygon.deleteCurrent(this.polygon)
                    }
                }

                if (this.activeTool.toLowerCase() === "eraser") {
                    if (e.key === "]") this.eraser.pathOptions.radius += 5;
                    if (e.key === "[") this.eraser.pathOptions.radius -= 5;
                }

                e.preventDefault();
                return false;
            },

            onkeyup: function (e) {
                if (e.target.tagName.toLowerCase() === "input") return;
                if (e.target.tagName.toLowerCase() === "textarea") return;

                if (e.key.toLowerCase() === "control") this.keys.ctrl = false;
                if (e.key.toLowerCase() === "shift") this.keys.shift = false;

                e.preventDefault();
                return false;
            },

            onCategoryClick: function (indices) {
                if (this.current.annotation === indices.annotation &&
                    this.current.category === indices.category) {
                    this.current = {category: -1, annotation: -1};
                } else {
                    this.current = indices;
                }
            },

            getCategory: function (index) {
                if (index == null) return null;
                if (index < 0) return null;

                let ref = this.$refs.category;

                if (ref == null) return null;
                if (ref.length < 1 || index >= ref.length) return null;

                return this.$refs.category[index];
            },

            /**
             * Zoom related functions
             */
            onwheel: function (e) {
                let view = this.paper.view;

                if (this.keys.ctrl) {
                    // Pan up and down
                    let delta = new paper.Point(0, 0.5*e.deltaY);
                    this.paper.view.setCenter(view.center.add(delta));
                } else if (this.keys.shift) {
                    // Pan left and right
                    let delta = new paper.Point(0.5*e.deltaY, 0);
                    this.paper.view.setCenter(view.center.add(delta));
                } else {
                    let viewPosition = view.viewToProject(new paper.Point(e.offsetX, e.offsetY));
                    let transform = this.changeZoom(e.deltaY, viewPosition);

                    if (transform.zoom < 10 && transform.zoom > 0.01) {

                        this.polygon.pathOptions.strokeWidth = (1 / (transform.zoom)) * 3;
                        this.eraser.pathOptions.strokeWidth = (1 / (transform.zoom)) * 3;
                        if (this.text != null) this.text.fontSize = (1 / (transform.zoom)) * 3;

                        this.paper.view.zoom = transform.zoom;
                        this.paper.view.center = view.center.add(transform.offset);
                    }
                }

                e.preventDefault();
                return false;
            },

            fit: function () {
                let canvas = document.getElementById('editor');

                let parentX = this.image.raster.width;
                let parentY = this.image.raster.height;

                this.paper.view.zoom = Math.min(
                    (canvas.width / parentX) * 0.95,
                    (canvas.height / parentY) * 0.85
                );

                this.polygon.pathOptions.strokeWidth = (1/(this.paper.view.zoom)) * 3;
                this.eraser.pathOptions.strokeWidth = (1/(this.paper.view.zoom)) * 3;

                this.hover.fontSize = (1/(this.paper.view.zoom)) * 3;
                this.paper.view.setCenter(0, 0)
            },

            changeZoom: function (delta, p) {
                let oldZoom = this.paper.view.zoom;
                let c = this.paper.view.center;
                let factor = 1 + this.zoom;

                let zoom = delta < 0 ? oldZoom * factor : oldZoom / factor;
                let beta = oldZoom / zoom;
                let pc = p.subtract(c);
                let a = p.subtract(pc.multiply(beta)).subtract(c);

                return {zoom: zoom, offset: a};
            },

            /**
             * API calls
             */
            getData: function () {
                this.status.data.state = false;

                axios.get('/api/annotator/data/' + this.image.id)
                    .then((response) => {

                        // Set image data
                        this.image.metadata = response.data.image.metadata;
                        this.image.filename = response.data.image.file_name;
                        this.image.categories = response.data.image.categories;
                        this.image.next = response.data.image.next;
                        this.image.previous = response.data.image.previous;

                        // Set other data
                        this.dataset = response.data.dataset;
                        this.categories = response.data.categories;

                        // Update status
                        this.status.data.state = true;
                    })
            },
            save: function (callback) {

                let refs = this.$refs;
                if (!refs.states.allLoaded) return;
                this.status.saving.state = false;

                let data = {
                    user: {},
                    image: {
                        id: this.image.id,
                        metadata: this.image.metadata,
                        settings: {
                            selectedLayers: this.current,
                        },
                    },
                    settings: {
                        activeTool: this.activeTool,
                        zoom: this.zoom,
                        tools: {
                            polygon: {
                                completeDistance: this.polygon.completeDistance,
                                guidance: this.polygon.guidance,
                                pathOptions: this.polygon.pathOptions
                            },
                        }
                    },
                    categories: []
                };

                if (refs.category != null) {
                    refs.category.forEach((category) => {
                        data.categories.push(category.export())
                    });
                }

                axios.post('/api/annotator/data', JSON.stringify(data))
                    .then(() => {
                        this.status.saving.state = true;
                        if (callback != null) callback();
                    }).catch(function (error) {
                        console.log(error);
                    });
            },
            initCanvas: function () {
                let canvas = document.getElementById('editor');
                this.paper = new paper.PaperScope();
                this.paper.setup(canvas);
                this.paper.activate();
                this.paper.view.setAutoUpdate(false);

                let img = new Image();
                this.status.image.state = false;
                img.onload = () => {

                    this.image.raster = new Raster({
                        source: axios.baseURL + this.image.url,
                        position: new paper.Point(0, 0)
                    });

                    this.image.raster.sendToBack();
                    this.fit();

                    tools.initTools(this);

                    let categories = this.$refs.category;
                    if (categories != null) {
                        categories.forEach(category => {
                            category.initCategory()
                        });
                    }
                    this.image.ratio = (this.image.raster.width * this.image.raster.height) / 1000000;
                    this.status.image.state = true;
                };
                img.src = this.image.url;

                this.paper.view.onFrame = event => {

                    // this.paper.project.getItems({
                    //     class: paper.Path,
                    //     match: function(path) {
                    //         path.visible = false;
                    //         return true
                    //     }
                    // });
                    //
                    // this.paper.project.getItems({
                    //     class: paper.Path,
                    //     overlapping: this.paper.view.bounds,
                    //     match: function(path) {
                    //         path.visible = true;
                    //         return true;
                    //     }
                    // });

                    this.paper.view.update()
                };
            },
            deleteImage: function () {
                axios.delete('/api/image/' + this.image.id).then(response => {
                    window.location.pathname = '/images/' + this.image.id;
                });
            },
            downloadCoco: function () {
                this.save(() => {
                    this.downloadURI("/api/image/" + this.image.id + "?asAttachment=true", this.image.filename);

                    axios.get("/api/image/" + this.image.id + "/coco").then(reponse => {
                        let dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reponse.data));
                        this.downloadURI(dataStr, this.image.filename.replace(/\.[^/.]+$/, "") + ".json")
                    });
                });
            },

            /**
             * Utilities
             */

            downloadURI: function (uri, exportName) {
                let link = document.createElement("a");
                link.href = uri;
                link.download = exportName;
                document.body.appendChild(link);
                link.click();
                link.remove();
            },

            setCompoundPath: function (compound) {
                let category = this.current.category;
                let annotation = this.current.annotation;

                if (category === -1) return;
                if (annotation === -1) return;

                this.getCategory(category).getAnnotation(annotation).setCompoundPath(compound);
            },

            setAnnotateURL: function (imageId) {
                location.pathname = "/" + location.pathname.split("/")[1] + "/" + imageId;
            },
        },
        watch: {
            activeTool: function (newValue, oldValue) {
                this.eraser.brush.visible = newValue.toLowerCase() === "eraser";
            },
            'polygon.pathOptions.strokeWidth': function (newStroke) {
                if (this.paper == null) return;
                if (this.polygon.path == null) return;
                this.polygon.path.strokeWidth = newStroke;
            },
            'eraser.pathOptions.strokeWidth': function (newStroke) {
                if (this.paper == null) return;
                if (this.eraser.brush == null) return;
                this.eraser.brush.strokeWidth = newStroke;
            },
            'hover.fontSize': function (newSize) {
                if (this.paper == null) return;
                if (this.hover.text == null) return;
                this.hover.text.fontSize = newSize;
            },
            'eraser.pathOptions.radius': function (newRadius, oldRadius) {
                if (this.paper == null) return;
                if (this.eraser.brush == null) return;

                let position = this.eraser.brush.position;
                this.eraser.brush.remove();
                this.eraser.brush = new paper.Path.Circle({
                    center: position,
                    strokeColor: this.eraser.pathOptions.strokeColor,
                    strokeWidth: this.eraser.pathOptions.strokeWidth,
                    radius: newRadius
                });
            },
        },
        computed: {
            compoundPath: function () {

                let category = this.current.category;
                let annotation = this.current.annotation;

                if (category === -1) return null;
                if (annotation === -1) return null;

                return this.getCategory(category).getAnnotation(annotation).getCompoundPath();
            },
        },
        created () {
            paper.install(window);
            axios.baseURL = window.location.origin;
            let pathname = window.location.pathname.split('/');
            this.image.id = parseInt(pathname[pathname.length - 1]);
            this.image.url = '/api/image/' + this.image.id;

            this.getData();
        },
        mounted () {
            window.addEventListener('keydown', (this.onKeydown = this.onkeydown.bind(this)));
            window.addEventListener('keyup', (this.onKeyup = this.onkeyup.bind(this)));
            this.autoSave = setInterval(this.save, 60*1000);

            this.initCanvas();
        },
        destroyed() {
            window.removeEventListener('keydown', this.onKeydown);
            window.removeEventListener('keydup', this.onKeyup);

            clearInterval(this.autoSave);
        }
    });
});