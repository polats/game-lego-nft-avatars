import JSZip from 'jszip';
import {uuidv4, _parse_xml, assign_uuids} from './utils';
import {Layer, Group} from "./layer";
import {Renderer} from "./render";

const ORA_VERSION = "0.0.1";
const TYPE_LAYER = 0, TYPE_GROUP = 1;

/**
 * @constructor
 */
function JSOra() {

    if(!(this instanceof JSOra)) {
        return new JSOra();
    }

    const self = this;
    self._children = [];
    self._children_elems = new WeakMap();
    self._children_uuids = {};
    self._isolate_non_opaque_groups = false;
    self._loading_callback_function = null;
    self._loading_callback_layers = {};
    self._extracted_zip_srcs = new WeakMap();

    this.get_by_path = function(path){
        if(path === '/') return self.root;
        if(path.startsWith('/')) path = path.replace('/', '');
        let current_group = self._root_group;
        for(let name of path.split('/')){
            let found = false;
            for(let child of current_group.children){
                if (child.name === name){
                    current_group = child;
                    found = true;
                    break;
                }
            }
            if(!(found)) throw `Layer with path ${path} was not found`;
        }
        return current_group;
    };

    this.get_by_uuid = function(uuid){
        if(uuid in self._children_uuids){
            return self._children_uuids[uuid];
        }
        throw `Layer with uuid ${uuid} was not found`;
    };

    Object.defineProperty(this,"children_recursive",{
        get: function() {
            return self._children;
        },
    });

    Object.defineProperty(this,"children",{
        get: function() {
            let children = [];
            for(let _child of self._root_group._elem.children){
                children.push(self.get_by_uuid(_child.getAttribute('uuid')));
            }
            return children;
        },
    });

    Object.defineProperty(this,"root",{
        // get the reference to the outermost, "root" group object.
        get: function() {
            return self._root_group;
        },
    });

    Object.defineProperty(this,"iter_visible_layers",{
        get: function() {
            let layer_list = [];
            for(let _l of self._elem_root.getElementsByTagName('layer')){
                if(self._children_elems.get(_l).visible_rendered){
                    layer_list.unshift(self._children_elems.get(_l));
                }
            }
            return layer_list;
        },
    });

    Object.defineProperty(this,"iter_layers",{
        get: function() {
            let layer_list = [];
            for(let _l of self._elem_root.getElementsByTagName('layer')){
                layer_list.unshift(self._children_elems.get(_l));
            }
            return layer_list;
        },
    });

    Object.defineProperty(this,"iter_groups",{
        get: function() {
            let layer_list = [];
            for(let _l of self._elem_root.getElementsByTagName('stack')){
                layer_list.unshift(self._children_elems.get(_l));
            }
            return layer_list;
        },
    });

    Object.defineProperty(this,"iter_tree",{
        get: function() {
            let layer_list = [];
            for(let _l of self._elem_root.querySelectorAll('layer,stack')){
                layer_list.unshift(self._children_elems.get(_l));
            }
            return layer_list;
        },
    });

    this.new = function(width, height, xres, yres){

        self._children = [];
        self._children_elems = new WeakMap();
        self._children_uuids = {};

        var ppi_xml = (xres !== undefined && yres !== undefined) ? `xres="${xres}" yres="${yres}"` : 'xres="72" yres="72"';
        self._elem_root = _parse_xml(`<image version="${ORA_VERSION}" h="${height}" w="${width}" ` +
                                        `${ppi_xml}>` +
                                        '<stack composite-op="svg:src-over" opacity="1" name="" isolation="isolate" ' +
                                        'visibility="visible" ></stack></image>').children[0];

        self._elem = self._elem_root.children[0];
        self._root_group = new Group(self, self._elem);


    };

    this.save = async function(composite_image_b64){
        // return a file object of the project
        var zip = new JSZip();
        zip.file("mimetype", "image/openraster");


        const rend = new Renderer(self);

        if(composite_image_b64 === undefined || composite_image_b64 === null ){

            // generate and save the merged image

            const merged_canvas = await rend.make_merged_image();

            //const merged_canvas_blob = await asyncToBlob(merged_canvas);
            composite_image_b64 = merged_canvas.toDataURL('image/png');


        }

        zip.file("mergedimage.png", composite_image_b64.split(',')[1], {'base64':true});


        const thumbnail_image_b64 = await rend._make_thumbnail(composite_image_b64);
        zip.file("Thumbnails/thumbnail.png", thumbnail_image_b64.split(',')[1], {'base64':true});

        let filename_counter = 0;
        for(let layer of self._children){
            if(layer._type === TYPE_LAYER){
                const layer_base64 = await layer.get_base64(true);
                const new_filename = `/data/layer${filename_counter}.png`;
                filename_counter++;
                layer._elem.setAttribute('src', new_filename);
                zip.file(new_filename, layer_base64.split(',')[1], {'base64':true});
            }
        }

        zip.file('stack.xml', self.get_stack_xml());


        return zip.generateAsync({type:"blob"});

    };

    this.set_progress_callback = function (callback_function) {
        /*
            Set a function which is called periodically as project loading progress changes
            The callback is called with two ordered parameters: (total_progress, layer_progress)

            total_progress is a single float between 0.0 and 1.0 describing the aggregate total progress
            of all layer loading
            layer_progress is an array of floats of the loading status of each individual layer
         */

        self._loading_callback_function = callback_function;
    };

    this._loading_pre_callback = function(layer){
        // this is called whenever there is a progress event in any layer
        // called with layer instance indicates that the download / unzip progress has updated
        // called with Number indicates that the render progress is updated (number -- currently processing layer)
        const num_rendering_layers = Object.keys(self._loading_callback_layers).length;
        let render_progress;
        let download_progress;
        if(typeof layer === 'number' ){
            render_progress = 100 * (layer / num_rendering_layers);
            download_progress = 100;
        }else{
            render_progress = 0;
            self._loading_callback_layers[layer.uuid] = layer._loaded_percent;
            download_progress = 0;

            for(let _uuid in self._loading_callback_layers){
                download_progress += self._loading_callback_layers[_uuid];
            }
            download_progress /= num_rendering_layers;
        }

        const total_progress = download_progress * 0.9 + render_progress * 0.1;
        self._loading_callback_function(total_progress, download_progress, render_progress,
            self._loading_callback_layers);
    };

    this.load = async function(file){
        await self._load(file);
    };

    this._load = async function(file, xml_dom){

        self._children = [];
        self._children_elems = new WeakMap();
        self._children_uuids = {};

        var zip;
        if(xml_dom){
            self._elem_root = xml_dom.children[0];
        }else{
            zip = await JSZip.loadAsync(file);
            const content = await zip.file("stack.xml").async("string");
            self._elem_root = _parse_xml(content).children[0];
        }

        self._elem = self._elem_root.children[0]; // get the "root" layer group

        // we expect certain default attributes for the root group (Krita follows this standard)
        self._elem.setAttribute("isolation", "isolate");
        self._elem.setAttribute("composite-op", "svg:src-over");
        self._elem.setAttribute("opacity", "1");
        self._elem.setAttribute("name", "");
        self._elem.setAttribute("visibility", "visible");

        async function _build_tree(parent){
            for (let child_elem of parent._elem.children){
                if(child_elem.getAttribute('uuid') === null){
                    child_elem.setAttribute('uuid', uuidv4());
                }
                let _new;
                if (child_elem.tagName === 'stack') {
                    _new = new Group(self, child_elem);
                    await _build_tree(_new);
                }else if (child_elem.tagName === 'layer') {
                    if(xml_dom){
                        _new = new Layer(child_elem.getAttribute('src'), self, child_elem);
                    }else{
                        _new = new Layer(zip.file(child_elem.getAttribute('src')), self, child_elem);
                    }
                }else{
                    console.log(`Warning: unknown tag in stack: ${child_elem.tagName}`);
                    continue;
                }
                self._children.push(_new);
                self._children_elems.set(child_elem, _new);
                self._children_uuids[_new.uuid] = _new;
            }
        }

        self._root_group = new Group(self, self._elem);

        await _build_tree(self._root_group);

    };

    this.from_stack_xml = async function(xml_dom){
        /*
            similar to .load() except using an xml stack only.
         */
        if(typeof xml_dom === 'string'){
            xml_dom = _parse_xml(xml_dom);
        }
        await self._load(null, xml_dom);
    };

    this._get_parent_from_path = function(path){
        const path_parts = path.split('/');
        const parent_path = path_parts.slice(0, path_parts.length-1).join('/');

        if (parent_path === ''){
            return self._root_group;
        }

        return self.get_by_path(parent_path);
    };

    this._insertElementAtIndex = function(parent, index, element){
        if (parent.children.length <= index) {
            parent.appendChild(element)
        } else {
            parent.insertBefore(element, parent.children[index]);
        }
    };

    this._add_elem = function(tag, parent_elem, name, attribs){
        attribs = attribs === null || attribs === undefined ? {} : attribs;
        const z_index = 'z_index' in attribs ? attribs['z_index'] : 1;
        const offsets = 'offsets' in attribs ? attribs['offsets'] : [0,0];
        const opacity = 'opacity' in attribs ? attribs['opacity'] : 1.0;
        const visible = 'visible' in attribs ? attribs['visible'] : true;
        const composite_op = 'composite_op' in attribs ? attribs['composite_op'] : "svg:src-over";

        if(tag === 'stack'){
            attribs['isolated'] = 'isolated' in attribs ? attribs['isolated'] : true;
        }

        // uuid generated is not provided
        if(!('uuid' in attribs)){
            attribs['uuid'] = uuidv4();
        }

        const new_elem = _parse_xml(`<${tag} name="${name}" x="${offsets[0]}" y="${offsets[1]}" ` +
                 `visibility="${visible === true ? 'visible' : 'hidden'}" opacity="${opacity}" ` +
                 `composite-op="${composite_op}"></${tag}>`).children[0];

        for(let key in attribs){
            new_elem.setAttribute(key, attribs[key]);
        }

        self._insertElementAtIndex(parent_elem, parent_elem.childElementCount-(z_index-1), new_elem);
        return new_elem;
    };

    this._add_group = function(parent_elem, name, attribs){

        const elem = self._add_elem('stack', parent_elem, name, attribs);
        const obj = new Group(self, elem);
        obj.isolated = true;

        self._children.push(obj);
        self._children_elems.set(elem, obj);
        self._children_uuids[obj.uuid] = obj;
        return obj;
    };

    this._make_groups_recursively = function(path){
        // creates all of the groups which would be required UNDER the specified path (not the final, deepest path element)
        // as this works with paths it will just choose the first matching path if duplicate names are found

        // absolute path slash is for styling/consistency only, remove it if exists
        if(path[0] === '/'){
            path = path.slice(1, path.length);
        }

        // descend through potential groups, creating some if they don't exist

        const parts = path.split('/');

        // remove the last, deepest part of the path, which we will not be creating
        parts.pop();
        let current_group = self._root_group;
        while(parts.length > 0){
            const expected_name = parts.shift();
            const existing = current_group.children.filter(child => child.name === expected_name);
            if(existing.length === 0){
                // need to create this one
                current_group = current_group.add_group(expected_name);
            }else{
                current_group = existing[0];
            }

        }
    };

    this._add_tree = function(parent_elem, name, other_group){
        /*
            Add a group, recursively, under the specified parent
            Each element is copied and has it's attributes copied.
         */

        function _build_tree(parent){
            for (let child_elem of parent._elem.children){
                if(child_elem.getAttribute('uuid') === null || child_elem.getAttribute('uuid') in self._children_uuids){
                    child_elem.setAttribute('uuid', uuidv4());
                }

                let _new;
                if (child_elem.tagName === 'stack') {
                    _new = new Group(self, child_elem);
                    _build_tree(_new);
                }else if (child_elem.tagName === 'layer') {
                    const image_source = other_group._project.get_by_uuid(child_elem.getAttribute('uuid'))._image_elem.src;
                    _new = new Layer(image_source, self, child_elem);
                }else{
                    console.log(`Warning: unknown tag in stack: ${child_elem.tagName}`);
                    continue;
                }
                self._children.push(_new);

                self._children_elems.set(child_elem, _new);
                self._children_uuids[_new.uuid] = _new;
            }
        }

        // insert xml structure
        const cloned_xml = other_group._elem.cloneNode(true);
        const z_index = 1;

        cloned_xml.setAttribute('name', name);
        if(cloned_xml.getAttribute('uuid') === null || cloned_xml.getAttribute('uuid') in self._children_uuids){
            cloned_xml.setAttribute('uuid', uuidv4());
        }

        self._insertElementAtIndex(parent_elem, parent_elem.childElementCount-(z_index-1), cloned_xml);

        const new_outer_group = new Group(self, cloned_xml);

        self._children.push(new_outer_group);
        self._children_elems.set(cloned_xml, new_outer_group);
        self._children_uuids[new_outer_group.uuid] = new_outer_group;

        _build_tree(new_outer_group);

        return new_outer_group;
    };

    this.add_group = function(path, attribs){
        self._make_groups_recursively(path);

        if(!(path[0] === '/')){
            path = '/' + path;
        }

        const parts = path.split('/');
        const name = parts[parts.length - 1];
        const parent_elem = self._get_parent_from_path(path)._elem;

        return self._add_group(parent_elem, name, attribs);
    };

    this.add_layer = function(src, path, attribs){

        self._make_groups_recursively(path);

        if(!(path[0] === '/')){
            path = '/' + path;
        }

        const parts = path.split('/');
        const name = parts[parts.length - 1];
        const parent_elem = self._get_parent_from_path(path)._elem;

        // make the new layer itself
        return self._add_layer(src, parent_elem, name, attribs);

    };

    this._add_layer = function(src, parent_elem, name, attribs){


        // add xml element
        attribs = attribs === undefined ? {} : attribs;

        const elem = self._add_elem('layer', parent_elem, name, attribs);
        const obj = new Layer(src, self, elem);

        self._children.push(obj);

        self._children_elems.set(elem, obj);
        self._children_uuids[obj.uuid] = obj;

        return obj;
    };

    this.remove = function(uuid){

        let root_child = self.get_by_uuid(uuid);

        let children_to_remove = [root_child];
        if(root_child.type === TYPE_GROUP){
            children_to_remove = children_to_remove.concat(root_child.children_recursive);
        }

        const parent_elem = root_child.parent._elem;

        // remove all of the global references to uuids and elems
        for(let _child of children_to_remove){
            self._children_elems.delete(_child._elem);
            if(_child.uuid !== null){
                delete self._children_uuids[_child.uuid];
            }
        }

        // this should only have to be done for the parent for all of the other elements to be gone in the XML tree
        parent_elem.removeChild(root_child._elem);

    };

    this.move = function(src_uuid, dst_uuid, dst_z_index){

        if(dst_z_index === undefined) dst_z_index = 1;
        let dest_parent;
        if(dst_uuid === null){
            dest_parent = self._root_group;
        }else{
            dest_parent = self.get_by_uuid(dst_uuid);
        }
        const child = self.get_by_uuid(src_uuid);

        const old_parent_elem = child.parent._elem;
        old_parent_elem.removeChild(child._elem);
        self._insertElementAtIndex(dest_parent._elem, dst_z_index-1, child._elem);

    };

    this.restore_visibility = function(){
        if(self._visibility_restore_context === undefined) return;
        for(let _uuid in self._visibility_restore_context){
            self.get_by_uuid(_uuid).visible = self._visibility_restore_context[_uuid];
        }
    };

    Object.defineProperty(this,"dimensions",{
        get: function() { return [Number(self._elem_root.getAttribute('w')),
                                  Number(self._elem_root.getAttribute('h'))]; },
    });

    Object.defineProperty(this,"width",{
        get: function() { return Number(self._elem_root.getAttribute('w')); },
    });

    Object.defineProperty(this,"height",{
        get: function() { return Number(self._elem_root.getAttribute('h')); },
    });

    Object.defineProperty(this,"ppi",{
        get: function() {
            if (self._elem_root.getAttribute('xres') && self._elem_root.getAttribute('yres')) {
                return [Number(self._elem_root.getAttribute('xres')),
                        Number(self._elem_root.getAttribute('yres'))];
            }
            return null;
        }
    });

    this.load_all_image_sources = async function(parallel, include_hidden, sync){
        /*
            Usually, images are loaded as they are needed for rendering, to use bandwidth only when it is needed.
            Calling this method pulls all of the image data for all raster layers, so that rendering will be ready much
            much faster is images were not loaded when rendering (or saving) was started. When image sources are
            set to web locations, this will use network bandwidth from the client. When image sources are loaded
            from the ORA file, this will mainly use CPU time due to uncompressing / local IO.

            parallel: if true, will start to load all images at the same time. With web sourced layers, this can speed
            things up if your images come from a number of sources / domains, but will likely not help much if all images
            are loaded from the same domain. Default: true

            include_hidden: if true, preload ALL images, even those which would not be rendered. If false, skip loading
            layers which would be hidden in a render. Default: false

            sync: this function will 'block' (await) for all load events to complete. Otherwise, it will resolve
            while the individual load events are still running. Running with parallel=false implies sync=true, so
            this only has an effect then parallel=true. With sync=false you can await the _loading_promise field
            on jsora.Layer() objects in your own algorithm. Default=true.
         */

        let layers_to_render;
        if(include_hidden === true){
            layers_to_render = self.iter_layers;
        }else{
            layers_to_render = self.iter_visible_layers;
        }

        if(self._loading_callback_function){
            // assembler the per-layer loading iterator thing
            self._loading_callback_layers = {};
            for(let i in layers_to_render){
                self._loading_callback_layers[layers_to_render[i].uuid] = layers_to_render[i]._loaded_percent;
            }
        }

        let promises = [];
        for(let i in layers_to_render){
            layers_to_render[i]._loading_promise = layers_to_render[i].load_image();
            promises.push(layers_to_render[i]._loading_promise);
            if(parallel !== true){
                await layers_to_render[i]._loading_promise;
            }
        }

        if(sync !== false){
            await Promise.all(promises);
        }
    };

    this.get_stack_xml = function(){
        /*
           Get the current stack.xml representation of the project
           (equivalent to the 'stack.xml' which would be saved on .save())
         */
        const serializer = new XMLSerializer();
        return serializer.serializeToString(self._elem_root);
    };


    this.set_stack_xml = function(xml_dom){
        /*
            Using the 'stack.xml' standard format, update the current project to reflect the new scheme.
            This allows updating attributes / positioning in an exportable format without needing to
            store / transfer all of the data in the raster files themselves.

            - all uuids in the incoming scheme must match uuids in the current project
            - optionally, updated sources can be provided (map: uuid to source)
         */

        if(typeof xml_dom === 'string'){
            xml_dom = _parse_xml(xml_dom)
        }

        // replace the xml doc with the new incoming one
        self._elem_root = xml_dom.children[0];

        // update the fixed root references
        self._elem = self._elem_root.children[0];
        self._root_group._elem = self._elem;
        self._children_elems = new WeakMap();

        // find every relevant element in the new document, and update references to new elems
        for(let _child of self._elem.querySelectorAll('*')){
            const obj = self._children_uuids[_child.getAttribute('uuid')];
            self._children_uuids[_child.getAttribute('uuid')]._elem = _child;
            self._children_elems.set(_child, obj);

        };

        for(let _layer of self.iter_layers){
            // src needs to be manually refreshed
            _layer.src = _layer._elem.getAttribute('src');
        }
    };




}

export {
    JSOra,
    assign_uuids,
    Renderer,
    TYPE_LAYER,
    TYPE_GROUP
}
