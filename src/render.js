import {onload2promise, cloneCanvas} from './utils';
import {BlendModes} from './blend';
import {CompositeModes} from './composite';
import {BlendNonSepModes} from './blendnonsep';
import * as gpujs from 'gpu.js';
import {TYPE_GROUP} from "./index";

const blend_modes = {'svg:multiply': 'multiply', 'svg:screen':'screen','svg:overlay':'overlay', 'svg:darken':'darken_only',
               'svg:lighten':'lighten_only', 'svg:color-dodge':'dodge', 'svg:color-burn':'burn',
               'svg:hard-light':'hard_light', 'svg:soft-light':'soft_light', 'svg:difference':'difference',
               };

const blend_modes_nonsep = {
    'svg:color':'color', 'svg:luminosity':'luminosity', 'svg:hue':'hue', 'svg:saturation':'saturation',
};

const composite_modes = {'svg:plus': 'plus', 'svg:dst-in': 'dst_in', 'svg:dst-out': 'dst_out', 'svg:src-atop': 'src_atop',
                         'svg:dst-atop': 'dst_atop'};

function Renderer(project){
    const self = this;
    this._project = project;
    this._blend_modes = null;
    this._blend_modes_nonsep = null;
    this._composite_modes = null;
    this._scale = 1.0;
    this._render_width = project.dimensions[0];
    this._render_height = project.dimensions[1];
    this._load_parallel = true;
    this._load_sync = false;
    this._preserveDrawingBuffer = true;

    Object.defineProperty(this,"_render_width",{
        get: function() {
            return project.dimensions[0] * self._scale;
        },
    });

    Object.defineProperty(this,"_render_height",{
        get: function() {
            return project.dimensions[1] * self._scale;
        },
    });

    this.set_scale = function(scale){
        /*
            set the scale (0.5: half size ; 2.0: double size) to render the ORA
         */
        self._scale = scale;
    };

    this.set_width = function(width){
        /*
            set the width (in px) to render the ORA, the height will be automatically changed to keep scale
         */
        self._scale = width / self._project.dimensions[0];
    };

    this.set_height = function(height){
        /*
            set the height (in px) to render the ORA, the width will be automatically changed to keep scale
         */
        self._scale = height / self._project.dimensions[1];
    };

    this._render_two = function(backdrop, layer_canvas, offsets, opacity, composite_op){

        if(opacity === undefined){
            opacity = 1.0;
        }

        // merge two layers of data together
        // this is run progressively to paint each layer in the stack
        //console.log('render 2 called', layer.name, layer.offsets)

        if (composite_op in blend_modes) {
            return self._blend_modes[blend_modes[composite_op]]
            (backdrop, layer_canvas, opacity, offsets[0], offsets[1],
                layer_canvas.width, layer_canvas.height);

        }else if(composite_op in blend_modes_nonsep) {
            return self._blend_modes_nonsep[blend_modes_nonsep[composite_op]]
            (backdrop, layer_canvas, opacity, offsets[0], offsets[1],
                layer_canvas.width, layer_canvas.height);

        }else if(composite_op in composite_modes) {
            return self._composite_modes[composite_modes[composite_op]]
            (backdrop, layer_canvas, opacity, offsets[0], offsets[1],
                layer_canvas.width, layer_canvas.height);

        }else {
            //assume svg:src - over
            return self._composite_modes.src_over(backdrop, layer_canvas, opacity,
                offsets[0], offsets[1], layer_canvas.width, layer_canvas.height);
        }
    };


    this.render_to_canvas = async function(canvas, root_group){
        /*
        Full render of the entire project
         */

        if(self._load_parallel){
            await self._project.load_all_image_sources(true, false, this._load_sync);
        }

        canvas.width = self._render_width;
        canvas.height = self._render_height;

        let gl = canvas.getContext('webgl2', { premultipliedAlpha: false,
                                               preserveDrawingBuffer: self._preserveDrawingBuffer});
        gl.imageSmoothingEnabled= false;

        // clear previous canvas
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        self.gpu = new gpujs.GPU({
            canvas: canvas,
            context: gl,
        });
        self.gpu.Kernel.prototype.getVariablePrecisionString = () => 'highp';
        self._blend_modes = new BlendModes(self.gpu, self._render_width, self._render_height);
        self._blend_modes_nonsep = new BlendNonSepModes(self.gpu, self._render_width, self._render_height);
        self._composite_modes = new CompositeModes(self.gpu, self._render_width, self._render_height);

        const all_children = root_group === undefined ? self._project.iter_tree : root_group.iter_tree;
        let current_group = root_group === undefined ? self._project._root_group : root_group;

        let isolated_stacks = [canvas];
        let non_isolated_alpha = 1.0;

        // bugfix for case when there are no isolated groups created

        const layer_canvas_base = document.createElement('canvas');
        layer_canvas_base.width = self._render_width;
        layer_canvas_base.height = self._render_height;
        isolated_stacks[0] = self._render_two(isolated_stacks[0], layer_canvas_base, [0, 0], 1.0);


        /*layer.parent = current_group;
         iterate layers, the isolated stack contains canvases for isolated groups we enter. When we enter a new
         isolated stack on our way up the tree, we append a blank canvas to this array. Painting of all layers
         proceeds on the last canvas in this array, until we reach the top of the isolated group. At that time we pop
         the last from the isolated stack and composite (or blend) it with the new last isolated stack canvas.
         Non isolated groups don't get an isolated canvas, but we maintain a current multiplier for the opacity value
         of all the non-isolated groups we enter, so that we can apply it to all layers inside of the non-isolated group

         For example, Group changes between layers 1 and 2.
         - If it gets deeper, we need to look up each parent
         above the new layer up to the parent we had last time. For each parent, if it is isolated, push to the
         isolated stack.
         - If it is shallower, will only change depth by one by definition. If isolated, pop the stack as said above.

         */


        // the last child will always just be the root group, so we don't need this in our main painting loop

        all_children.pop();

        for(let i=0; i<all_children.length; i++){



            const child = all_children[i];

            const add_deeper_stacks = function(){
                let tmp_check_group = child.parent;
                while(tmp_check_group !== current_group) {
                    // iterate upward to check for isolated stacks to create
                    if(tmp_check_group._renders_isolated) {
                        const backdrop = document.createElement("canvas");
                        backdrop.width = self._render_width;
                        backdrop.height = self._render_height;
                        isolated_stacks.push(backdrop);
                    }else{
                        non_isolated_alpha *= tmp_check_group.opacity;
                    }
                    tmp_check_group = tmp_check_group.parent;

                }
            };

            if(child.type === TYPE_GROUP){
                if(child.children.length === 0){
                    // if we have an empty group we don't need to render anything for it, but we still might need to
                    // assign a number of isolated or non-isolated new stacks as if it was a new child
                    // so we follow the same algorithm as the group change below
                    add_deeper_stacks();
                    current_group = child.parent;
                    continue;
                }
                // one level shallower, close the group
                if(child._renders_isolated) {
                    // closing an isolated group, blend or composite with the next shallower isolated group
                    const to_merge = isolated_stacks.pop();
                    const merge_onto = isolated_stacks[isolated_stacks.length - 1];

                    isolated_stacks[isolated_stacks.length - 1] = self._render_two(merge_onto, to_merge,
                        [0, 0], current_group.opacity,
                        current_group.visible ? current_group.composite_op : 'svg:src-over');

                }else{
                    non_isolated_alpha *= (1 / current_group.opacity);
                }
                current_group = child.parent;
                continue;
            }

            if(child.parent !== current_group) {
                // group change (deeper)
                // one or more levels deeper, might need to create more isolated stacks
                add_deeper_stacks();
                current_group = child.parent;

            }

            // load the layer image and draw it onto a canvas

            const layer_canvas = document.createElement('canvas');
            layer_canvas.width = self._render_width;
            layer_canvas.height = self._render_height;

            if(!child.hidden_rendered) {
                await child.load_image();
                const ctx = layer_canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(child._image_elem,
                    child.offsets[0] * self._scale,
                    child.offsets[1] * self._scale,
                    child._image_elem.width * self._scale,
                    child._image_elem.height * self._scale);
            }

            // composite or blend this layer with the current isolated stack
            const merge_onto = isolated_stacks[isolated_stacks.length - 1];
            isolated_stacks[isolated_stacks.length - 1] = self._render_two(merge_onto, layer_canvas, [0, 0],
                child.opacity*non_isolated_alpha,
                child.visible_rendered ? child.composite_op : 'svg:src-over');

            if (self._project._loading_callback_function){
                self._project._loading_pre_callback(i+1);
            }

        }

        if(isolated_stacks.length !== 1){
            console.warn("Incorrect number of post-rendering isolated stacks, something went wrong!");
        }

        gl = null;

    };

    this.make_merged_image = async function(){


        let canvas = document.createElement('canvas');
        await self.render_to_canvas(canvas);
        return cloneCanvas(canvas);

    };

    this._make_thumbnail = async function(composite_image_b64){
        let canvas = document.createElement('canvas');
        canvas.width = self._project.dimensions[0];
        canvas.height = self._project.dimensions[1];

        var ratio = 1.0;
        if (canvas.width > 256 || canvas.height > 256){
            // if some dim too big
            ratio = (canvas.width >= canvas.height) ? 256 / canvas.width : 256 / canvas.height;
            canvas.width = ratio * canvas.width;
            canvas.height = ratio * canvas.height;
        }

        const image = document.createElement('img');
        image.setAttribute('src', composite_image_b64);
        await onload2promise(image);
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;

        ctx.drawImage(image,0,0,canvas.width,canvas.height);

        return canvas.toDataURL('image/png');

    };

}

export {
    Renderer
}