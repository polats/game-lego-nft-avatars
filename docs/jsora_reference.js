if(true) {
        //const rend = new jsora.Renderer(project);
        //const devcanvas = document.getElementById('devcanvas');

    // old python driver instructions start here

    // make a new ORA file from a few image files

    project.new(100, 100);

    // adding a layer
    project.add_layer("https://picsum.photos/100", 'Root Level Layer');

    // adding a layer at any arbitrary path will automatically create the appropriate layer groups
    project.add_layer("https://picsum.photos/50", 'Some Group/Another Layer');

    // two ways to set attributes, during add and after the fact
    let new_layer = project.add_layer("https://picsum.photos/75", 'Group2/Layer3', {
        opacity: 0.5,
        offsets: [10, 20]
    });
    new_layer.name = 'Actually Layer4';

    // set arbitrary future attributes (in the stack file) before they are officially supported
    new_layer.set_attribute("awesome-future-thing", 'yes');

    // changing the name of a group
    project.get_by_path('/Group2').name = 'test';

    // you can add groups manually too if you like, though its not usually required
    project.add_group('/manually added group');

    // an example of how to save the file. Note that project.save() is an async function, here we save without 'await' for reference
    // in this example we use the external library "FileSaver.js" to facilitate passing the file blob data to the user
    // https://github.com/eligrey/FileSaver.js
    // project.save().then(function (blob){
    //     saveAs(blob, "output1.ora");
    // });

    var blob;
    blob = await project.save();
    await saveAs(blob, "output1.ora");

    project = jsora.JSOra();
    // how z indexes work
    project.new(100, 101);
    project.add_layer("https://picsum.photos/50", 'g1/l1');
    const g1l2 = project.add_layer("https://picsum.photos/50", 'g1/l2');
    project.add_layer("https://picsum.photos/50", 'g2/l1');
    const g2l2 = project.add_layer("https://picsum.photos/50", 'g2/l2');

    // z_index is relative to group, l3 should be in between l1 and l2
    project.add_layer("https://picsum.photos/50", 'g1/l3', {z_index: 2});

    // l0 should be at the root of the project in between groups g1 and g2
    let l0 = project.add_layer("https://picsum.photos/50", 'l0', {z_index: 2});


    console.log(g1l2.z_index, g1l2.z_index_global);  // index 3 in the group, third layer overall
    console.log(g2l2.z_index, g2l2.z_index_global);  // index 2 in the group, sixth layer overall
    console.log(l0.z_index, l0.z_index_global);  // index 2 in the group (the root group), fourth layer overall

    blob = await project.save();
    await saveAs(blob, "output2.ora");

    // edit / open existing file

    // this is just ony quick way to generate a File() object from a base64 string, but in general, any File() object
    // can be used instead


    function dataURLtoFile(b64data, filename) {
        var bstr = atob(b64data), n = bstr.length, u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, {type: 'image/openraster'});
    }


    const ora_file = dataURLtoFile(ora_file_b64, 'test.ora');

    await project.load(ora_file);

    // add a new layer
    project.add_layer("https://picsum.photos/50", 'new_layer', {z_index: 2, opacity: 0.75});

    // get the image data of a layer and use it somewhere
    // Note that Layer.get_base64() is an async function
    const layer_base64 = await project.get_by_path('/Layer 2').get_base64();
    var img_elem2 = document.createElement('img');
    img_elem2.setAttribute('src', layer_base64);
    document.body.append(img_elem2);

    //save edits
    blob = await project.save();
    saveAs(blob, "output3.ora");

    // just reading a file, more methods

    // overall canvas size
    console.log(project.dimensions);

    // children includes all items (layers and groups currently) in a non-enforced order
    for (let layer of project.children) {
        // you can filter these type of objects like this
        if (layer.type === jsora.TYPE_LAYER) {
            console.log(layer.name, layer.UUID);
            console.log(layer.z_index, layer.z_index_global, layer.opacity, layer.visible, layer.hidden);
        }
    }

    // you can get only layer objects (not groups) in order
    for (let layer of project.children) {
        console.log(layer.path);
    }

    // you can also get anything by path or UUID explicitly
    const layer1 = project.get_by_path('/Layer 2');
    console.log(layer1);
    layer1.UUID = "6A163DC4-B344-4C76-AF3B-369484692B20";

    // this UUID does not exist, and is an error case
    const layer2 = project.get_by_uuid("6A163DC4-B344-4C76-AF3B-369484692B20");
    console.log(layer2);

        // deleting and moving layers / groups
        // console.log(project.children)
     ///// project.move('js.png, mult', null, '/', null) ???
        //project.move('js.png, mult', null, '/', null, 2);
        //project.move('js.png, mult', null, '/Layer 1', null)

        // var rendered = await rend.make_merged_image();

        // document.body.appendChild(rendered);    

}
