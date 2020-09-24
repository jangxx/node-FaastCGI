module.exports = {
    main: function(req, res) {
        // setHeader("X-Header", "blubb");
        res.json({ path: req.path });
        // stream.write("response");
        // stream.end();
        // res.set("X-header", "gon give it to ya");
        // res.send("und tschüss");
        // res.write("msg 1\n");
        // res.send("bye bye");
        // res.end();
    },
};