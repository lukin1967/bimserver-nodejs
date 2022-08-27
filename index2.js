
const needle = require("needle");
const fs = require("fs");
const cors = require("cors");
const express = require("express");
const { Server } = require("socket.io");
const { Socket } = require("dgram");
const http = require("http");

//setup basic express server
const app = express();
const port = 8088;
app.use(cors());
app.use(express.static("./")); //serves files on root folder

const server = http.createServer(app);

const io = require("socket.io")(server, {
  cors: {
    origin: "*", //this should be changed
    methods: ["GET", "POST"],
  },
});

//bimserver details
let address = "bimserver address";

let username = "bimserver username";
let password = "your password";

let options = { json: true };

// let query = { //see examples at bimserver bimviews plugin
//     type: {
//       name: "IfcProduct",
//       includeAllSubTypes: true,
//     },
//   };

let query = {};

//login

let loginData = {
  request: {
    interface: "AuthInterface",
    method: "login",
    parameters: {
      username: username,
      password: password,
    },
  },
};

io.on("connection", (socket) => {
  console.log("a user connected");

  //create project
  socket.on(
    "createProject",
    (arg) => {
      needle.post(address + "json", loginData, options, (err, resp) => {
        if (err) {
          console.log(err);
        }

        var token = resp.body.response.result;

        //console.log("logged in ", token);

        let addProjectData = {
          token: token,
          request: {
            interface: "ServiceInterface",
            method: "addProject",
            parameters: {
              projectName: "testproject" + Math.random(),
              schema: "ifc2x3tc1",
            },
          },
        };

        //add a project
        needle.post(address + "json", addProjectData, options, (err, resp) => {
          if (err) {
            console.log(err);
          }
        });
      });
      
    }
  );

  //get list of projects in bimserver
  socket.on("getProjects", (arg) => {
    needle.post(address + "json", loginData, options, (err, resp) => {
      if (err) {
        console.log(err);
      }
      let token = resp.body.response.result;

      let getAllProjectsData = {
        token: token,
        request: {
          interface: "ServiceInterface",
          method: "getAllProjects",
          parameters: {
            onlyTopLevel: false,
            onlyActive: true,
          },
        },
      };

      needle.post(
        address + "json",
        getAllProjectsData,
        options,
        (err, resp) => {
          if (err) {
            console.log(err);
          }
          let res = resp.body.response.result;
          let reslist = [];
          let resname = [];
          //let map1 = new Map();

          res.forEach((element) => {
            reslist.push(element.oid);
            //map1.set(element.oid, element.name);
          });

          res.forEach((element) => {
            resname.push(element.name);
          });

          socket.emit("projectIds", resname, reslist);
        }
      );
    });

  });

  //get latest revision given project id

  socket.on("getLatestRevision", (currentProjectID) => {
    needle.post(address + "json", loginData, options, (err, resp) => {
      if (err) {
        console.log(err);
      }
      let token = resp.body.response.result;
      //getSerializerByContentType
      let serializerByContentType = {
        token: token,
        request: {
          interface: "ServiceInterface",
          method: "getSerializerByContentType",
          parameters: {
            contentType: "application/ifc",
          },
        },
      };
      needle.post(
        address + "json",
        serializerByContentType,
        options,
        (err, resp) => {
          if (err) {
            console.log(err);
          }

          let serializerOid = resp.body.response.result.oid;

          //get revision

          let getRevisionProject = {
            token: token,
            request: {
              interface: "ServiceInterface",
              method: "getAllRevisionsOfProject",
              parameters: {
                poid: currentProjectID,
              },
            },
          };

          needle.post(
            address + "json",
            getRevisionProject,
            options,
            (err, resp) => {
              if (err) {
                console.log(err);
              }

              let res = resp.body.response.result;

              let revisionId = [];

              res.forEach((element) => {
                revisionId.push(element.oid);
                //map1.set(element.oid, element.name);
              });
    
              console.log("rev id: " + revisionId);

              let fileName = "model" + currentProjectID + revisionId.toString() + ".ifc";

              if (!fs.existsSync("./" + fileName))
              {
                let download = {
                  token: token,
                  request: {
                    interface: "ServiceInterface",
                    method: "download",
                    parameters: {
                      roids: revisionId, //array/list of revisions, need to check this... 
                      query: JSON.stringify(query),
                      serializerOid: serializerOid,
                      sync: false,
                    },
                  },
                };
                console.log("serializerOid" + serializerOid);
                //download
                needle.post(address + "json", download, options, (err, resp) => {
                  if (err) {
                    console.log(err);
                  }
  
                  let topicId = resp.body.response.result;
                  //getDownloadData using topicId
                  let downloadData = {
                    token: token,
                    request: {
                      interface: "ServiceInterface",
                      method: "getDownloadData",
                      parameters: {
                        topicId: topicId,
                      },
                    },
                  };
                  console.log("topic id" + topicId);
  
                  let progress = {
                    token: token,
                    request: {
                      interface: "NotificationRegistryInterface",
                      method: "getProgress",
                      parameters: {
                        topicId: topicId,
                      },
                    },
                  };
  
                  needle.post(
                    address + "json",
                    progress,
                    options,
                    (err, resp) => {
                      if (err) {
                        console.log(err);
                      }
  
                      console.log("progress: " + resp.body.response.result);
  
                      needle.post(
                        address + "json",
                        downloadData,
                        options,
                        (err, resp) => {
                          if (err) {
                            console.log(err);
                          }
    
                          var fileData = resp.body.response.result.file;
                          var fileString = new Buffer(fileData, "base64");

                          fs.writeFile(
                            fileName,
                            fileString,
                            function (err) {

                              if (err) throw err;
                            }
                          );
  
                          socket.emit("fileName", fileName);
                        }
                      );
                    }
                  );
                });
              }
              //else load latest/estisting model
               else { socket.emit("fileName", fileName);}
            }
          );
        }
      );
    });
  });
});

server.listen(port, () =>
  console.log(`Example app listening on port ${port}!`)
);

