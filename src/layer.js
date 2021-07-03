
import {onload2promise, loadImage} from './utils';
import {TYPE_LAYER, TYPE_GROUP} from "./index";
import {Renderer} from "./render";

function ItemBase(project, elem, _type){
    const self = this;
    self._elem = elem;
    self._type = _type;
    self._project = project;


    this.set_attribute = function(attribute, value){
        // for setting attributes of xml elements not yet covered by this library / spec
        self._elem.setAttribute(attribute, value);
    };

    self._attribs_keys = ['opacity', 'hidden', 'isolated', 'offsets', 'z_index', 'composite_op'];
    Object.defineProperty(this,"attribs",{
        get: function() {
            let ret = {};
            for(let key of self._attribs_keys){
                ret[key] = self[key];
            }
            return ret;
        },
        set: function(attribs){
            for(let key of self._attribs_keys){
                if(key in attribs){
                    self[key] = attribs[key];
                }
            }
        }
    });

    Object.defineProperty(this,"uuid",{
        get: function() { return self._elem.getAttribute("uuid"); },
        set: function(value) {
            delete self._project._children_uuids[self.uuid];
            self._project._children_uuids[String(value)] = self;
            self._elem.setAttribute("uuid", String(value));
        }
    });

    Object.defineProperty(this,"parent",{
        get: function() {
            if(self._elem === self._project._root_group._elem) return null;
            if(self._elem.parentNode === self._project._root_group._elem) return self._project._root_group;
            return self._project._children_uuids[self._elem.parentNode.getAttribute('uuid')]; }
    });

    Object.defineProperty(this,"opacity",{
        get: function() { return Number(self._elem.getAttribute("opacity")); },
        set: function(value) { self._elem.setAttribute("opacity", String(Number(value))) }
    });

    Object.defineProperty(this,"opacity_rendered",{
        // how opaque this layer looks when considering the opacity of all ancestors
        get: function() {
            let opacity = 1.0;
            let parent = self;
            while(true){
                opacity *= parent.opacity;
                parent = parent.parent;
                if(parent === null){
                    return opacity;
                }
            }
        },
    });

    Object.defineProperty(this,"visible",{
        get: function() { return self._elem.hasAttribute("visibility") ?
            self._elem.getAttribute("visibility") === 'visible' : true; },
        set: function(value) { value === true ? self._elem.setAttribute("visibility", "visible") :
                                                self._elem.setAttribute("visibility", "hidden")}
    });

    Object.defineProperty(this,"visible_rendered",{
        // visible property of this group when considering all ancestors
        get: function() {
            let parent = self;
            while(true){
                if(parent.hidden){
                    return false;
                }
                parent = parent.parent;
                if(parent === null){
                    return true;
                }
            }
        },
    });

    Object.defineProperty(this,"hidden_rendered",{
        // hidden property of this group when considering all ancestors
        get: function() { return !self.visible_rendered; },
    });


    Object.defineProperty(this,"hidden",{
        get: function() { return !self.visible; },
        set: function(value) { value === true ? self._elem.setAttribute("visibility", "hidden") :
                                                self._elem.setAttribute("visibility", "visible")}
    });

    Object.defineProperty(this,"name",{
        configurable: true,
        get: function() { return self._elem.getAttribute("name"); },
        set: function(value) { self._elem.setAttribute("name", String(value)) }
    });

    Object.defineProperty(this,"composite_op",{
        configurable: true,
        get: function() { return self._elem.hasAttribute("composite-op") ?
            self._elem.getAttribute("composite-op"): "svg:src-over"; },
        set: function(value) { self._elem.setAttribute("composite-op", String(value)) }
    });

    Object.defineProperty(this,"type",{
        get: function() { return self._type; },
    });

    Object.defineProperty(this,"offsets",{
        get: function() {
            return [Number(self._elem.getAttribute('x') || '0'),
                    Number(self._elem.getAttribute('y') || '0')];
        },
        set: function(value) {
            self._elem.setAttribute('x', String(value[0]));
            self._elem.setAttribute('y', String(value[1]));
        }
    });

    /*
        Get the stacking position of the layer, relative to the group it is in (or the root group).
        Higher numbers are 'on top' of lower numbers. The lowest value is 1.
        :return: int - the z_index of the layer
     */
    Object.defineProperty(this,"z_index",{
        configurable: true,
        get: function() {
            if(self.parent === null){
                return 1;
            }
            const childList = self.parent._elem.children;
            // replacement for jquery.index() magic
            const index = Array.prototype.findIndex.call(childList, e => e === self._elem);
            return (childList.length - index);
        },
        set: function(value) {
            if(self.parent === null){
                console.error('It is not possible to set the z-index of the root group');
            }
            const parent = self.parent._elem;
            parent.removeChild(self._elem);
            self._project._insertElementAtIndex(parent, parent.childElementCount-(value-1), self._elem);
        }
    });

    this._is_parent_of = function(other_child){
        // traverse from other_child upward until 'this' is found, or no more parents
        let parent = other_child.parent;
        while(true){
            if(parent === self){
                return true;
            }else if(parent === null){
                return false;
            }
            parent = parent.parent;
        }
    }

    this.show_only_this = function(){
        /*
            Convenience function to hide all other layers / groups except for this one and it's children
            This stores a listing of the original layer visibility settings in the project, which can be
            recovered by calling <project>.restore_visibility() (if show_only_this() is called again in the
            project, before restore_visibility(), the stored state will be lost / replaced)
         */
        self._project._visibility_restore_context = {};
        // we want to show parents, and self
        // we want to ignore children of self
        // everything else should be hidden


        const ignored = self.type === TYPE_GROUP ? self.children_recursive : [];

        for(let _child of self._project.children_recursive){
            self._project._visibility_restore_context[_child.uuid] = _child.visible;
            if(_child === self || _child._is_parent_of(self)){
                // show self and parents of self
                _child.visible = true;
            }else if(ignored.indexOf(_child) === -1){
                // don't change settings of children, else hide
                _child.visible = false;
            }
        }
    };

    this.move_to = function(dst_uuid, dst_z_index){
        self._project.move(self.uuid, dst_uuid, dst_z_index)
    }

    this.remove = function(){
        self._project.remove(self.uuid);
    }


};



function Layer(src_or_zip, project, elem){

    /*
        src_or_zip: should either be a external url, data url, or an instance of
        JSZip.File() (with method .async("base64"))
     */


    ItemBase.call(this, project, elem, TYPE_LAYER);
    const self = this;
    self._needs_to_reload = true;
    self._src = src_or_zip;
    self._loaded_percent = 0.0;
    self._loading_promise = null;

    self._set_image_elem = function(){
        self._image_elem = new Image();
        self._image_elem.setAttribute('crossorigin', "anonymous");
    };
    self._set_image_elem();

    Object.defineProperty(this,"src",{
        set: function(value) {
            self._set_image_elem();
            self._elem.setAttribute("src", String(value));
            self._src = value;
            self._needs_to_reload = true;
            self._loaded_percent = 0.0;
        },
        get: function(){
            return self._elem.getAttribute("src");
        }
    });

    Object.defineProperty(this,"name",{
        set: function(value) {
            self._elem.setAttribute("name", String(value))
        }
    });

    Object.defineProperty(this,"z_index_global",{
        get: function() {
            const layerList = self._project.iter_layers;
            for(let i = 0; i<layerList.length; i++){
                if(layerList[i] === self){
                    return i + 1;
                }
            }
        },
    });

    this.load_image = async function(){

        if(self._loading_promise){
            // the load is already running
            await self._loading_promise;
            self._loading_promise = null;
            return;
        }
        // start actually pulling data from SRC in order to load the image src

        // if the layer src is a JSzip instance, we want to avoid needing to actually extract it multiple
        // times, so if we need to extract the data, we store it in the project weakmap
        // we don't need to worry about this caching for string based sources because the browser will
        // cache the image data automatically

        if(!self._needs_to_reload) return ;

        let _final_src;
        if(typeof self._src === 'string'){
            if(self._src.startsWith('data:image/png;base64,' )){
                // no need for progress load
                _final_src = self._src;
            }else{
                if (self._project._loading_callback_function){
                    _final_src = await loadImage(self._src, function(progress){
                        self._loaded_percent = progress === -1 ? 100 : progress ;
                        self._project._loading_pre_callback(self)
                    })
                }else{
                    // save converting to/from arraybuffer if not needed
                    _final_src = self._src;
                }
            }
        }else{
            // assume JSZip instance ; extract from zip
            // in this case this await here actually takes much longer than the one below
            // but we still need both to gurantee the image element is finished loading fully

            if(!(self._src in self._project._extracted_zip_srcs)){
                self._project._extracted_zip_srcs.set(self._src,
                    'data:image/png;base64,' + await self._src.async("base64", function(progress){
                        if (self._project._loading_callback_function) {
                            self._loaded_percent = progress.percent;
                            self._project._loading_pre_callback(self)
                        }
                    }));
            }
            _final_src = self._project._extracted_zip_srcs.get(self._src);

        }

        self._image_elem.setAttribute('src', _final_src);
        if(!self._image_elem.complete){
            //wait loadImage(self._image_elem);
            await onload2promise(self._image_elem);
        }

        self._needs_to_reload = false;
    };

    this.get_base64 = async function(raw){

        await self.load_image();

        const canvas = document.createElement('canvas');
        if(raw === undefined || raw === true){
            canvas.width = self._image_elem.width;
            canvas.height = self._image_elem.height;
            const ctx = canvas.getContext("2d");
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(self._image_elem, 0, 0);
        }else{
            canvas.width = self._project.dimensions[0];
            canvas.height = self._project.dimensions[1];
            const ctx = canvas.getContext("2d");
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(self._image_elem, self.offsets[0], self.offsets[1]);
        }
        return canvas.toDataURL();
    }

};

function Group(project, elem){
    ItemBase.call(this, project, elem, TYPE_GROUP);
    const self = this;

    this.add_layer = function(src, name, attribs){
        return self._project._add_layer(src, self._elem, name, attribs);
    };

    this.add_group = function(name, attribs){
        return self._project._add_group(self._elem, name, attribs);
    };

    this.add_tree = function(name, other_group){
        return self._project._add_tree(self._elem, name, other_group);
    };

    this.get_base64 = async function(){

        const canvas = document.createElement('canvas');
        const rend = new Renderer(self._project);
        await rend.render_to_canvas(canvas, self);

        return canvas.toDataURL();
    }

    Object.defineProperty(this,"_renders_isolated",{
        get: function() {
            return self.isolated ||
                (self._project._isolate_non_opaque_groups && self.opacity < 1.0) ||
                self.composite_op !== 'svg:src-over';
        },
    });

    Object.defineProperty(this,"children",{
        get: function() {
            let children = [];
            for(let _child of self._elem.children){
                children.push(self._project.get_by_uuid(_child.getAttribute('uuid')));
            }
            return children;
        },
    });

    Object.defineProperty(this,"children_recursive",{
        get: function() {
            let children = [];
            for(let _child of self._elem.querySelectorAll('*')){
                children.push(self._project.get_by_uuid(_child.getAttribute('uuid')));
            }
            return children;
        },
    });

    Object.defineProperty(this,"iter_tree",{
        get: function() {
            let layer_list = [];
            for(let _l of self._elem.querySelectorAll('layer,stack')){
                layer_list.unshift(self._project._children_elems.get(_l));
            }
            layer_list.push(self);
            return layer_list;
        },
    });

    Object.defineProperty(this,"uuids",{
        get: function() {
            let children = [];
            for(let _child of self._elem.querySelectorAll('*')){
                children.push(_child.getAttribute('uuid'));
            }
            return children;
        },
    });

    Object.defineProperty(this,"groups",{
        get: function() {
            let children = [];
            for(let i=self._elem.children.length-1; i>=0; i--){
                const _child = self._elem.children[i];
                if(_child.tagName === 'stack'){
                    children.push(self._project.get_by_uuid(_child.getAttribute('uuid')));
                }
            }
            return children;
        },
    });

    Object.defineProperty(this,"layers",{
        get: function() {
            let children = [];
            for(let i=self._elem.children.length-1; i>=0; i--){
                const _child = self._elem.children[i];
                if(_child.tagName === 'layer'){
                    children.push(self._project.get_by_uuid(_child.getAttribute('uuid')));
                }
            }
            return children;
        },
    });

    Object.defineProperty(this,"groups_recursive",{
        get: function() {
            let children = [];
            for(let _child of self._elem.querySelectorAll('stack')){
                children.push(self._project.get_by_uuid(_child.getAttribute('uuid')));
            }
            return children;
        },
    });

    Object.defineProperty(this,"layers_recursive",{
        get: function() {
            let children = [];
            for(let _child of self._elem.querySelectorAll('layer')){
                children.push(self._project.get_by_uuid(_child.getAttribute('uuid')));
            }
            return children;
        },
    });

    Object.defineProperty(this,"isolated",{
        get: function() { return self._elem.getAttribute("isolation") === 'isolate' },
        set: function(value) {
            self._elem.setAttribute("isolation", value === true ? 'isolate' : 'auto')
        }
    });

    Object.defineProperty(this,"name",{
        set: function(value) {
            // need to update stored paths in parent
            // const old_path = self._path;
            // let parts = self._path.split('/');
            // parts[parts.length-1] = value;
            // self._path = parts.join('/');
            // // in this case we also need to go through all the other paths that involved this group and replace them
            // for (let _path in self._project._children_paths){
            //
            //     if(_path.startsWith(old_path)){
            //         //console.log(_path, old_path, self._path)
            //         let _new_path = _path.replace(old_path, self._path)
            //         //console.log(self._project._children_paths, _new_path, _path)
            //         self._project._children_paths[_new_path] = self._project._children_paths[_path];
            //         //console.log(self._project._children_paths)
            //         delete self._project._children_paths[_path];
            //     }
            // }


            self._elem.setAttribute("name", String(value))
        }
    });
};

export {
    Layer,
    Group
}