/* jshint quotmark:false, eqeqeq:false, laxbreak:true, unused:false */
(function(window, $, undefined) {
  'use strict';

  var appContext = $('[data-app-name="araport-blast-app"]');

  //the different blast types and their app IDs
  var blastTypes = {
    'blastn' : {app: 'blastn', dbtype: 'nucl'},
    'blastp': {app: 'blastp', dbtype: 'prot'},
    'blastx': {app: 'blastx', dbtype: 'prot'},
    'tblastn': {app: 'tblastn', dbtype: 'nucl'},
    'tblastx': {app: 'tblastx', dbtype: 'nucl'}
  };

  var blastTypesFilter = [
      {lbl: '--Select One--', val:'.*' },
      {lbl: 'blastn', val: '^blastn'},
      {lbl: 'blastp', val: '^blastp'},
      {lbl: 'blastx', val: '^blastx'},
      {lbl: 'tblastn', val: '^tblastn'},
      {lbl: 'tblastx', val: '^tblastx'},
  ];

  //app template
  var BLAST_CONFIG = {
        'name': 'blast-%DATESTAMP%',
        'appId': 'ncbi-blastn-2.2.29u3',
        'queue': 'normal',
        'nodeCount': 1,
        'maxMemoryPerNode': 1,
        'processorsPerNode': 1,
        'requestedTime': '00:30:00',
        'archive': true,
        'archivePath': '%USERNAME/blastplus/archive/jobs/blast-%DATESTAMP%',
        'archiveSystem': 'araport-storage-00',
        'mainFolder': 'blastplus',
        'uploadFolder': 'uploads',
        'archiveFolder': 'archive',
        'jobsFolder': 'jobs',
        'sequencesFolder': 'sequences',
        'databasesFolder': 'databases',
        'metadataName': 'araport.blastdb.index',
        'appMetadataName': 'araport.ncbi-blast.applist',
        /*
        'notifications': [{
             'url':'username@tacc.utexas.edu',
             'event':'FINISHED',
             'persistent':false
          }],
        */
        'parameters' : {
            'database': 'TAIR10_cdna_20101214_updated',
            'evalue': 0.001,
            'format':'HTML',
            'ungapped':false,
            'matrix':'BLOSUM62',
            'filter':true,
            'lowercase_masking':false
        },
        'inputs': {
                    'query': 'mock/test.nt.fa'
        }
    };

    BLAST_CONFIG.runningStates  = ['PENDING', 'STAGING_INPUTS', 'CLEANING_UP', 'ARCHIVING', 'STAGING_JOB', 'RUNNING', 'PAUSED', 'QUEUED', 'SUBMITTING', 'STAGED', 'PROCESSING_INPUTS', 'ARCHIVING_FINISHED'];
    BLAST_CONFIG.errorStates    = ['KILLED', 'FAILED', 'STOPPED','ARCHIVING_FAILED'];
    BLAST_CONFIG.finishedStates = ['FINISHED'];

    var BlastApp = {}; //info dumping ground 
    //using date and time as an identifier. probably should switch this to a uuid or something 
    if (!Date.now) { 
        Date.now = function() { return new Date().getTime(); }; 
    } 
    var now = Date.now(); 
    BlastApp.now = now; 
    BLAST_CONFIG.archivePath = BLAST_CONFIG.archivePath.replace('%DATESTAMP%',now); 
    BLAST_CONFIG.name = BLAST_CONFIG.name.replace('%DATESTAMP%',now);

    /* PRIVATE FUNCTIONS */
    BlastApp.getUserAppId = function(){
        return $("[name='appId']:checked").val();
    };
    BlastApp.updateStatusIcon = function(status){
        var ppc = appContext.find('.job-status .blast-job-status-icon');
        ppc.removeClass('glyphicon-remove glyphicon-ok glyphicon-refresh blast-reload-icon');
        switch(status){
            case "pending":
                ppc.addClass('glyphicon-refresh blast-reload-icon');
                break;
            case "error":
                ppc.addClass('glyphicon-remove');
                break;
            case "success":
                ppc.addClass('glyphicon-ok');
                break;
        }
    };

    BlastApp.checkJobListStatus = function(){
        var tbody = appContext.find('.blast-job-history-content table tbody')[0];
        var trs = tbody.rows;
        var tr, status, id, newStatus, td, icon, cnt;
        var sf = function(response){
            var data = JSON.parse(response.data);
            if(data.status === "success"){
                newStatus = data.result.status;
                tr = $(tbody).find("tr[data-id=" + data.result.id + "]");
                td = $(tr.find("td")[0]);
                if(BLAST_CONFIG.errorStates.indexOf(newStatus) >= 0) {
                    icon = td.find('.job-list-icon span');
                    icon.removeClass('glyphicon-refresh blast-reload-icon glyphicon-remove');
                    icon.addClass('glyphicon-remove');
                    icon.attr('style', 'color:red;');
                    tr.attr('data-status', newStatus);
                    td.find('.job-list-status').text(newStatus);
                }else if(BLAST_CONFIG.finishedStates.indexOf(newStatus) >= 0) {
                    icon = td.find('.job-list-icon span');
                    icon.removeClass('glyphicon-ok blast-reload-icon glyphicon-remove glyphicon-refresh');
                    icon.addClass('glyphicon-ok');
                    icon.attr('style', 'color:green;');
                    tr.attr('data-status', newStatus);
                    td.find('.job-list-status').text(newStatus);
                }else if(BLAST_CONFIG.runningStates.indexOf(newStatus) >= 0) {
                    tr.attr('data-status', newStatus);
                    td.find('.job-list-status').text(newStatus);
                }
            }
        };
        var crf = function(response){
            var data = JSON.parse(response.data);
            if(data.status === 'success'){
                var job = data.result;
                tr = $(tbody).find("tr[data-id=" + data.result.id + "]");
                var ntr = BlastApp.createRow(job);
                if(BLAST_CONFIG.finishedStates.indexOf(job.status) >= 0) {
                    var archiveUrl = job._links.archiveData.href;
                    archiveUrl = archiveUrl.substring(archiveUrl.indexOf(BlastApp.username), archiveUrl.length);
                    var archive = archiveUrl + '/' + job.appId.split('-')[1] + '_out';
                    BlastApp.createDownloadViewLink(job, ntr, archive);
                }
                BlastApp.createActionLinks(job, ntr);
                tr.replaceWith(ntr);
            }
        };
        var eef = function(err){
            /*Print the error to the console*/
            if(console){console.log("Error getting job status: ", err);}
        };
        var ef = function(err){
            /*If a job is pending Agave.api.jobs.get({"jobId":"id"}) will return a 404.
            This means that we can only now the status of the job using getStatus*/
            if(console){
                console.log("Error getting job , let's try gettin just the status ", err);
            }
            window.Agave.api.jobs.getStatus({"jobId": id}, 
                sf,
                eef);
        };
        cnt = 0;
        for(var i = 0; i < trs.length; i++){
            tr = trs[i];
            status = tr.getAttribute('data-status');
            id = tr.getAttribute('data-id');
            if(BLAST_CONFIG.runningStates.indexOf(status) >= 0) {
                cnt++;
                td = $(tr.querySelector("td"));
                window.Agave.api.jobs.get({"jobId":id},
                    crf,
                    ef);
            }
        }
        if(cnt === 0){
            //clearInterval(BlastApp._jobListChecker);

        }
    };

    BlastApp.showTooltip = function(el){
        var tr = el.parent().parent().parent();
        var id = tr[0].getAttribute("data-id");
        var status = tr[0].getAttribute("data-status");
        var infotr = tr.parent().find('#blast-info-' + id);
        if(infotr.length > 0){
            infotr.remove();
            return;
        }
        var span = $('.blast-history-meta span#' + id).clone();
        infotr = $('<tr id="blast-info-' + id + '">' + 
                        '<td colspan="6"></td>' + 
                   '</tr>');
        infotr.find('td').append(span);
        tr.after(infotr);
        span.removeClass('blast-hidden');
        /*
        if ( span.hasClass("blast-hidden") ){
            if(tr.offset().top < span.height()){
                span.addClass("north");
                span.css({top: tr.offset().top + tr.height(), left:tr.parent().width() / 2});
            } else {
                span.css({top: tr.offset().top - span.height(), left:tr.parent().width() / 2});
                span.removeClass("north");
            }
            span.removeClass("blast-hidden");
        }else{
            $(".blast-history-meta span").addClass("blast-hidden");
            span.addClass("blast-hidden");
        }
        */
    };

    BlastApp.downloadArchivedResults = function(archive){
        if(typeof archive === 'undefined'){
            return;
        }
        var Agave = window.Agave;
        var outputData;
        Agave.api.files.download({'systemId':BLAST_CONFIG.archiveSystem,'filePath':archive},
            function(output) {
                console.log(output);
                outputData = output.data;
                console.log(outputData);
                try {
                    var isFileSaverSupported = !!new Blob();
                    if(!isFileSaverSupported) { 
                        BlastApp.jobError('Sorry, your browser does not support this feature. Please upgrade to a modern browser.'); }
                } catch (e) {
                    BlastApp.jobError('Sorry, your browser does not support this. Please upgrade to a modern browser.');
                    return;
                }
                if(typeof outputData === 'undefined') {
                    BlastApp.jobError('Could not download data.');
                }else{
                    var paths = archive.split("/");
                    var fileName = paths[paths.length-1] + '_' + paths[paths.length-2].split('-')[1] + '_out.' + BLAST_CONFIG.parameters.format;
                    window.saveAs(new Blob([outputData]), fileName);
                }
            },
            function(err) {
                console.log('Could not download the results file!');
                //todo error handling here
                BlastApp.jobError('Could not get resulting output file. ' + err);
            }
        );
    };

    BlastApp.showArchivedResults = function(archive){
        if(typeof archive == 'undefined'){
            return;
        }
        var Agave = window.Agave;
        var outputData;
        Agave.api.files.download({'systemId': BLAST_CONFIG.archiveSystem, 'filePath': archive},
            function(output){
                console.log(output);
                outputData = output.data;
                console.log(outputData);
                if(typeof outputData === 'undefined'){
                    BlastApp.jobError('Could not download data.');
                    return;
                }
                var m = $("<div class='modal fade blast-output-modal'>" +
                            "<div class='modal-dialog'>" +
                              "<div class='modal-content'>" +
                                "<div class='modal-header'>" + 
                                  "<button type='button' class='close' data-dismiss='modal' aria-label='Close'><span aria-hidden='true'>&times;</span></button>" + 
                                  "<h4 class='modal-title'>Data</h4>" + 
                                "</div>" + 
                                "<div class='modal-body'>" + 
                                    outputData + 
                                "</div>" + 
                                "<div class='modal-footer'>" + 
                                "<button type='button' class='btn btn-default' data-dismiss='modal'>Close</button>" + 
                              "</div>" + 
                            "</div>" + 
                          "</div>");
                m.modal('toggle');
            },
            function(err){
                if(console){
                    console.log(err);
                }
            });
    };

    BlastApp.manageJob = function(jobId, action){
        var Agave = window.Agave;
        Agave.api.jobs.manage({'jobId': jobId, 'body':"{\"action\":\"" + action + "\"}"}, 
            function(response){
                var data = JSON.parse(response.data);
                if(data.status == "success"){
                    setTimeout(BlastApp.getJobList(), 1500);
                }
            }, 
            function(err){
                BlastApp.jobError("There was an error resubmitting the job, please refresh and try again.");
                if(console){
                    console.log(err.reason);
                }
            });
    };

    BlastApp.createActionLinks = function(job, row){
        var tdspan = row.find(".blast-history-actions");
        var a = $("<a href=\"#\">" + 
              "<span class=\"glyphicon glyphicon-refresh\"></span> " + 
              "<span>Resubmit</span>" +
              "</a>");
        a.click(function(e){
            e.preventDefault();
            var el = $(this);
            var jobId = el.parent().parent().parent().attr("data-id");
            el.find('.glyphicon').addClass('blast-reload-icon');
            BlastApp.manageJob(jobId, "resubmit");
        });
        tdspan.append(a);
        tdspan.append("<br>");

        if(BLAST_CONFIG.runningStates.indexOf(job.status) >= 0) {
            a = $("<a href=\"#\">" + 
                  "<span class=\"glyphicon glyphicon-stop\"></span> " + 
                  "<span>Stop</span>" +
                  "</a>");
            a.click(function(e){
                e.preventDefault();
                var el = $(this);
                var jobId = el.parent().parent().parent().attr("data-id");
                el.find('.glyphicon').addClass('blast-reload-icon');
                BlastApp.manageJob(jobId, "stop");
            });
            tdspan.append(a);
            tdspan.append("<br>");
        }

        a = $("<a href=\"#\">" +
              "<span class=\"glyphicon glyphicon-info-sign\"></span>" +
              "<span> More Info</span>" +
              "</a>");
        a.click(function(e){
            e.preventDefault();
            BlastApp.showTooltip($(this));
        });
        tdspan.append(a);
        tdspan.append("<br>");
    };

    BlastApp.createDownloadViewLink = function(job, row, archive){
        if(BLAST_CONFIG.finishedStates.indexOf(job.status) < 0){
            return;
        }
        var a;
        var tdspan = row.find(".blast-history-download");
        a = $("<a href=\"" + archive  + "\"><span class='glyphicon glyphicon-save'></span> Download Results</a>");
        a.click(function(e){
            e.preventDefault(); 
            BlastApp.downloadArchivedResults(this.getAttribute("href")); }
            );
        tdspan.append(a);
        tdspan = row.find(".blast-history-view");
        a = $("<a href=\"" + archive + "\"><span class='glyphicon glyphicon-eye-open'></span> View Results</a>");
        a.click(function(e){
            e.preventDefault();
            BlastApp.showArchivedResults(this.getAttribute("href")); }
            );
        tdspan.append(a);
    };

    BlastApp.createRow = function(job){
        var ds = new Date(job.created);
        var de = new Date(job.endTime);
        var icon;
         if(BLAST_CONFIG.runningStates.indexOf(job.status) >= 0) {
            icon = "<span class='glyphicon glyphicon-refresh blast-reload-icon'></span>";
        } else if(BLAST_CONFIG.errorStates.indexOf(job.status) >= 0) {
            icon = "<span class='glyphicon glyphicon-remove' style='color:red'></span>";
        } else if(BLAST_CONFIG.finishedStates.indexOf(job.status) >=0) {
            icon = "<span class='glyphicon glyphicon-ok' style='color:green'></span>";
        }
        var row = $("<tr data-status=" + job.status + " data-id=" + job.id +">" +
            "<td><span class='job-list-icon'>" + icon + "</span> " +
                 "<span class='job-list-status'>" + job.status + "</san></td>" +
            "<td>" + job.name + "</td>" + 
            "<td>" + job.appId.split('-')[1] + "</td>" +
            "<td><span style=\"font-weight:bold;\">Created:</span><span> " 
                   + ((ds.getMonth() + 1) < 10 ? "0" + (+ds.getMonth() + 1) : (ds.getMonth() + 1))
                   + "/" + (ds.getDate() < 10 ? "0" + ds.getDate() : ds.getDate()) + "/" 
                   + ds.getFullYear() + " " + 
                   (ds.getHours() < 10 ? "0" + ds.getHours() : ds.getHours()) + ":" 
                   + (ds.getMinutes() < 10 ? "0" + ds.getMinutes() : ds.getMinutes())
                   +  "</span></br>" +
                +  "</td>" +
            "<td><span class='blast-history-view blast-result-link'></span>" + 
            "<span class='blast-history-download blast-result-link'></span></td>" +
            "<td><span class='blast-history-actions'></span></td>" +
            "</tr>");
        return row;
    };

    BlastApp.createSpanMetadata = function(job){
        var span = $("<span id=" + job.id + " class=\"blast-hidden blast-tooltip-info\">" +
        "<ul><li><b>ExecutionSystem: </b></li>" + 
        "</li>" + job.executionSystem + "</li>" +
        "<li><b>Job Id: </b></li>" + 
        "<li>" + job.id + "</li>" +
        "<li><b>App Id: </b></li>" +
        "<li>" + job.appId + "</li>" +
        "<li><b>Name: </b></li>" +
        "<li>" + job.name + "</li>" +
        "</span>");
        return span;
    };

    BlastApp.printJobDetails =  function(job, jhc, jhm){
        var span, archiveUrl, archive, row;
        //Print info
        archiveUrl = job._links.archiveData.href;
        archiveUrl = archiveUrl.substring(archiveUrl.indexOf(BlastApp.username), archiveUrl.length);
        archive = archiveUrl + '/' + job.appId.split('-')[1] + '_out';
        //var archive = archiveUrl + '/' + job.name + '.out';
        row = BlastApp.createRow(job);

        BlastApp.createDownloadViewLink(job, row, archive);

        BlastApp.createActionLinks(job, row);

        jhc.append(row);

        span = BlastApp.createSpanMetadata(job);

        jhm.append(span);
    };

    BlastApp.filterBy = function(table, filter, coli, showPage){
        var trs = $("tbody tr", table);
        var tr, td, val;
        var re = new RegExp(filter);
        for(var i = 0; i < trs.length; i++){
            tr = trs[i];
            if(tr.cells.length < coli || i === trs.length - 1){
                continue;
            }
            val = tr.cells[coli].textContent;
            tr = $(tr);
            if (!val.match(filter)){
                tr.hide();
                tr.attr("data-lvot", "true");
            }else{
                //tr.show();
                tr.removeAttr("data-lvot");
            }
        }
        table.attr("data-filter", filter);
        var rlength = $("tbody tr[data-lvot!=\"true\"]", table).length;
        if(showPage){
            BlastApp.showPage(table, rlength, 10, 1, 1);
        }
    };

    BlastApp.printTableFilter = function(table, jhc, values, label, name){
        var select = $("<select name=\"" + name + "\" id=\"" + name + "\"></select>");
        var lbl = $("<label for=\"" + name + "\">" + label + "</label>");
        var v, o;
        for(var i =0; i < values.length; i++){
            v = values[i];
            o = $("<option value=\"" + v.val + "\">" + v.lbl + "</option>");
            select.append(o);
        }
        select.change(function(){BlastApp.filterBy(table, $(this).val(), 1, true);});
        jhc.append(lbl);
        jhc.append(select);
    };

    BlastApp.appendPager = function(table, pager){
        var row = $(".blaster-pager-row", table);
        var cell;
        var append = false;
        if(row.length <= 0){
            row = $("<tr class=\"blaster-pager-row\" data-lvot=\"true\"></tr>");
            cell = $("<td colspan=\"5\"></td>");
            row.append(cell);
            append = true;
        }else{
            cell = $("td", row);
        }
        cell.append(pager);
        if(append){
            table.append(row);
        }
        row.show();
    };

    BlastApp.showPage = function(table, rlength, pageLength, curPage, page){
        $("tbody tr[data-lvot!=\"true\"]", table).hide();
        var trs = $("tbody tr[data-lvot!=\"true\"]", table);
        var tr;
        for(var i = (page - 1) * pageLength; i < ((page - 1) * pageLength + (pageLength - 1)) && i < (page * pageLength); i++){
            tr = $(trs[i]);
            tr.show();
        }
        curPage = +page;
        $(".blaster-pager", table).remove();
        var ul = BlastApp.buildPager(table, rlength, pageLength, curPage);
        BlastApp.appendPager(table, ul);
    };

    BlastApp.buildPager = function(table, rlength, pageLength, curPage){
        var pages = Math.ceil(rlength / pageLength);
        var ul = $("<ul class=\"blaster-pager\"></ul>");
        
        if(pages < 2){ return ul; }

        ul.append("<li><a href=\"previous\">Previous</a></li>");
        if(curPage == 1){
            ul.append("<li><span>1</span></li>");
        }else{
            ul.append("<li " + (curPage == 1? "class=\"selected\"" : "") + "><a href=\"1\">1</a></li>");
        }
        if(curPage - 2 != 1 && curPage - 2 > 1){
            ul.append("<li><span>...</span></li>");
        }
        if(curPage - 1 != 1 && curPage - 1 > 1){
            ul.append("<li><a href=\"" + (curPage - 1) + "\">" + (curPage - 1) + "</a></li>");
        }
        if(curPage != 1 && curPage != pages) {
            ul.append("<li><span>" + curPage + "</span></li>");
        }
        if(curPage + 1 != pages && curPage + 1 < pages){
            ul.append("<li><a href=\"" + (curPage + 1) + "\">" + (curPage + 1) + "</a></li>");
        }
        if(curPage + 2 != pages && curPage + 2 < pages){
            ul.append("<li><span>...</span></li>");
        }
        if(curPage == pages){
            ul.append("<li><span>" + pages + "</span></li>");
        }else{
            ul.append("<li " + (curPage == pages? "class=\"selected\"" : "") + "><a href=\"" + pages + "\">" + pages + "</a></li>");
        }
        ul.append("<li><a href=\"next\">Next</a></li>");
        $("a", ul).click(function(e){
            e.preventDefault();
            var page = $(this).attr('href');
            if (page == 'previous' && curPage - 1 > 0){
                page = curPage - 1;
            }else if(page == 'previous' && curPage - 1 <= 0){
               page = 1;
            }else if(page == 'next' && curPage + 1 <= pages){
                page = curPage + 1;
            }else if(page == 'next' && curPage + 1 > pages){
                page = pages;
            }
            BlastApp.showPage(table, rlength, pageLength, curPage, page);
        });
        return ul;
    };

    //get the user's profile info, mostly for the username
    BlastApp.getProfile = function(Agave) {
        Agave.api.profiles.me(null,
            function(results) {
                console.log('Hi, ' + results.obj.result.username + '! Welcome to the Araport Blast App!');
                if(results.obj.status !== 'success') {
                    BlastApp.jobError('Could not find your profile information.');
                }
                BlastApp.username = results.obj.result.username;
                BLAST_CONFIG.archivePath = BLAST_CONFIG.archivePath.replace('%USERNAME',BlastApp.username);
                BlastApp.prepareFileSystem(Agave);
            }, function(err){
                console.log('Could not find profile info.', err);
                BlastApp.jobError('Could not find your profile information.');
            }
        );
    };

    BlastApp.prepareFileSystem = function(Agave){
        Agave.api.files.list({systemId: BLAST_CONFIG.archiveSystem, filePath: BlastApp.username + '/' + BLAST_CONFIG.mainFolder},
            function(res){
                if(console){
                    console.log(res);
                }
            },
            function(err){
                console.log('Error', err);
                if(err.obj.status === 'error'){
                console.log('Creating Blastplus directory');
                console.log(err);
                    Agave.api.files.manage({systemId: BLAST_CONFIG.archiveSystem, filePath: BlastApp.username + '/', body: '{"action": "mkdir", "path": "' + BLAST_CONFIG.mainFolder + '"}'},
                     function(res){
                         console.log('Blastplus directory created');
                         Agave.api.files.manage({systemId: BLAST_CONFIG.archiveSystem, filePath: BlastApp.username + '/' + BLAST_CONFIG.mainFolder, body: '{"action": "mkdir", "path": "' + BLAST_CONFIG.uploadFolder + '"}'},
                    function(res){
                        console.log('Upload Folder Created');
                        Agave.api.files.manage({systemId: BLAST_CONFIG.archiveSystem, filePath: BlastApp.username + '/' + BLAST_CONFIG.mainFolder + '/' + BLAST_CONFIG.uploadFolder, body: '{"action": "mkdir", "path": "' + BLAST_CONFIG.sequencesFolder + '"}'},
                    function(res){
                        console.log('Sequences folder created.');
                    },
                    function(err){
                        console.log('Couldn\'t create sequences folder');
                    });
                        Agave.api.files.manage({systemId: BLAST_CONFIG.archiveSystem, filePath: BlastApp.username + '/' + BLAST_CONFIG.mainFolder + '/' + BLAST_CONFIG.uploadFolder, body: '{"action": "mkdir", "path": "' + BLAST_CONFIG.databasesFolder + '"}'},
                    function(res){
                        console.log('Databases folder created.');
                    },
                    function(err){
                        console.log('Couldn\'t create databases folder');
                    });
                    },
                     function(err){
                         console.log('Couldn\'t create upload folder');
                         console.log(err);
                     }
                    );
                         Agave.api.files.manage({systemId: BLAST_CONFIG.archiveSystem, filePath: BlastApp.username + '/' + BLAST_CONFIG.mainFolder, body: '{"action": "mkdir", "path": "' + BLAST_CONFIG.archiveFolder + '"}'},
                    function(res){
                        console.log('Archive folder created');
                        Agave.api.files.manage({systemId: BLAST_CONFIG.archiveSystem, filePath: BlastApp.username + '/' + BLAST_CONFIG.mainFolder + '/' + BLAST_CONFIG.archiveFolder, body: '{"action": "mkdir", "path": "' + BLAST_CONFIG.jobsFolder + '"}'},
                        function(res){
                            console.log('Jobs Folder Created');
                        },
                        function(err){
                            console.log('couldn\'t create jobs folder');
                            console.log(err);
                        });
                    },
                    function(err){
                        console.log('Couldn\'t create archive folder');
                        console.log(err);
                    });
                },
                function(err){
                    console.log('Coundn\'t create blastplus directory');
                    console.log(err);
                });
            }
       });
    };

    /*
    *
    * Go fetch the list of available databases from the blast/index.json file on araport-compute-00-storage
    * @deprecated for getDatabasesMetadata
    *
    */
    BlastApp.getDatabases = function(Agave) {
        if(BlastApp.databases) { return; }
        appContext.find('.nucleotides').html('<span class="glyphicon glyphicon-refresh blast-reload-icon"></span> Fetching available databases');
        Agave.api.files.download({'systemId':'araport-compute-00-storage','filePath':'blast/index.json'},function(json) {
            BlastApp.databases = JSON.parse(json.data).databases;
            //todo - check for empty databases response
            var nukes = '';
            var peps = '';
            BlastApp.databases.forEach(
                function(el) {
                    var dbEl = '<div class="checkbox"><label><input type="checkbox" class="blast-database" value="'+el.filename+'">'+el.label+'</label></div>';
                    if(el.type === 'nucleotide') {
                        nukes += dbEl;
                    } else {
                        peps += dbEl;
                    }
                }
            );
            appContext.find('.nucleotides').html(nukes);
            appContext.find('.peptides').html(peps);
        }, function() {
            console.log('Failed to find list of available databases.');
            appContext.find('.nucleotides').html('Unable to find available databases!');
            BlastApp.jobError('Unable to find available databases.');
        });
    };

    BlastApp.getAppId = function(Agave){
        Agave.api.meta.listMetadata({q: '{name: "' + BLAST_CONFIG.appMetadataName + '"}'},
            function(data){
                var result = data.obj.result;
                var apps, app, r, v, j;
                apps = [];
                for(var i = 0; i < result.length; i++){
                    r = result[i];
                    v = r.value;
                    apps = apps.concat(v); 
                }
                if(apps.length == 1){
                    app = apps[0];
                    BLAST_CONFIG.appId = app;
                    return app;
                }
                j = Math.floor(Math.random() * apps.length);
                app = apps[j];
                BLAST_CONFIG.appId = app;
                return app;
            },
            function(err){
                if(console){
                    console.log(err);
                }
                return "";
            });
        return "";
    };

    BlastApp.setupAppId = function(Agave){
        var appId = BlastApp.getAppId(Agave);
        //BLAST_CONFIG.appId = appId;
    };

    BlastApp.getDatabasesMetadata = function(Agave){
        var localDbs = localStorage.getItem('blastDBs');
        var getDbs = true;
        if(localDbs !== null){
            var timestamp = new Date().getTime();
            var tw = timestamp - JSON.parse(localDbs).timestamp;
            if((tw/1000) < 3600){
                getDbs = false;
            }
        }
        appContext.find('.nucl').html('<span class="glyphicon glyphicon-refresh blast-reload-icon"></span> Fetching available databases');
        var nukes = '', peps = '';
        var printDbs = function(element, index, array){
            index++;
            var dbstr = '<label class="btn btn-default db-button">' +
                        '<input type="checkbox" name="blast-dbs" value="' + element.filename + '" autocomplete="off">' + element.label + '</label>';
            if(element.dbtype === 'nucl'){
                nukes += dbstr;
            }else{
                peps += dbstr;
            }
        };
        if(getDbs){
        var sortDbs = function(a , b){
            if(a.dbtype > b.dbtype){
                return 1;
            }
            if(a.dbtype < b.dbtype){
                return -1;
            }
            return 0;
        };
        Agave.api.meta.listMetadata({q: '{name: "' + BLAST_CONFIG.metadataName + '"}'}, 
            function(data){
                var result = data.obj.result;
                var dockerDbs, dbs, db, r, v, j;
                dbs = [];
                for(var i = 0; i < result.length; i++){
                    r = result[i];
                    v = r.value;
                    dockerDbs = v.docker_this.databases;
                    dbs = dbs.concat(dockerDbs);
                }
                dbs = dbs.sort(sortDbs);
                dbs.forEach(
                    printDbs
                );
                BlastApp.databases = dbs;
                localStorage.setItem('blastDBs', JSON.stringify({timestamp: new Date().getTime(), dbs: BlastApp.databases}));
            }, 
            function(err){
                BlastApp.jobError('Unable to retrieve databases.');
            });
        }else{
            BlastApp.databases = JSON.parse(localDbs).dbs;
            BlastApp.databases.forEach(
                    printDbs
                );
        }
        appContext.find('.nucl').html('<div data-toggle="buttons">' + nukes + '</div>');
        appContext.find('.prot').html('<div data-toggle="buttons">' + peps + '</div>');
        appContext.find('[name="blast-dbs"]').change(function(){
            BlastApp.enableRunButton();
        });

    };

    //Check the status of a job by jobId, react appropriately
    BlastApp.checkJobStatus = function() {
        console.log('BlastApp.status = ' + BlastApp.status);
        var Agave = window.Agave;
        if(BLAST_CONFIG.runningStates.indexOf(BlastApp.status) >= 0) {
            //appContext.find('.job-status').html('Checking...');
            Agave.api.jobs.getStatus({'jobId' : BlastApp.jobId},
                //call success function
                function(json) {
                    //todo check json.obj.status === 'success'
                    BlastApp.status = json.obj.result.status;
                    appContext.find('.job-status .job-status-message').html(BlastApp.status);
                    if(BLAST_CONFIG.runningStates.indexOf(BlastApp.status) >= 0) {
                        console.log('BlastApp.status = ' + BlastApp.status + '. Checking again.');
                        setTimeout(function() { BlastApp.checkJobStatus(); }, 2500);
                    } else if(BLAST_CONFIG.errorStates.indexOf(BlastApp.status) >= 0) {
                        console.log('found ' + BlastApp.status + ' in BLAST_CONFIG.errorStates ' + BLAST_CONFIG.errorStates + ' with indexOf=' + BLAST_CONFIG.errorStates.indexOf(BlastApp.status));
                        BlastApp.updateStatusIcon("error");
                        BlastApp.jobError('Job status is ' + BlastApp.status);
                    } else if(BLAST_CONFIG.finishedStates.indexOf(BlastApp.status) >=0) {
                        BlastApp.updateStatusIcon("success");
                        BlastApp.jobFinished(json.obj.result);
                    } else {
                        console.log('unknown job state! =' + BlastApp.status);
                    }

                },
                //call err function
                function() {
                    BlastApp.jobError('Could not fetch job status.');
                }
            );
        }
    };

    //when job is finished download the result file and stuff it in the browser
    BlastApp.jobFinished = function(result) {
        BlastApp.result = result;
        console.log('getting output file ' + BlastApp.outputFile);
        //now go get the output file and stuff it into the page
        BlastApp.fetchResults();
    };

    BlastApp.fetchResults = function () {
        var Agave = window.Agave;
        Agave.api.files.download({'systemId':BLAST_CONFIG.archiveSystem,'filePath':BlastApp.outputFile},
            function(output) {
                console.log('successful download of results ' + BlastApp.outputFile );
                console.log(output);
                BlastApp.outputData = output.data;
                appContext.find('.blast-job-buttons').removeClass('hidden');
                if(BLAST_CONFIG.parameters.format !== 'HTML') {
                    appContext.find('.job-output').html('<pre>' + BlastApp.outputData + '</pre>');
                } else {
                    appContext.find('.job-output').html(BlastApp.outputData );
                }
            },
            function(err) {
                console.log('Could not download the results file!');
                //todo error handling here
                BlastApp.jobError('Could not get resulting output file. ' + err);
            }
        );
    };

    BlastApp.downloadResults = function() {
        try {
            var isFileSaverSupported = !!new Blob();
            if(!isFileSaverSupported) { BlastApp.jobError('Sorry, your browser does not support this feature. Please upgrade to a modern browser.'); }
        } catch (e) {
            BlastApp.jobError('Sorry, your browser does not support this. Please upgrade to a modern browser.');
            return;
        }
        if(!BlastApp.outputData) {
            BlastApp.jobError('Could not download data.');
        }
        var fileName = BlastApp.blastType + '_' + BlastApp.now + '_out.' + BLAST_CONFIG.parameters.format;
        window.saveAs(new Blob([BlastApp.outputData]), fileName);
    };

    //UI show errors to user
    //!!!TODO improve error handling
    BlastApp.jobError = function(error) {
        console.log('Boo! Job is in an error state!', error);
        appContext.find('.blast-errors').html('<h3>Blast encountered an error</h3><p>' + error + '</p>');
        appContext.find('.blast-errors').removeClass('hidden');
    };

    //Retrieve a list of user's jobs. Will sort by status
    BlastApp.getJobList = function(){
        var Agave = window.Agave;
        //Agave.api.jobs.searchLikeAppId(
        //    {'appId.like':'*blast*'},
        Agave.api.jobs.list(
            null,
            function(result){
                var data = JSON.parse(result.data);
                if(data.status === 'success'){
                    console.log(data);
                    var table = appContext.find('.blast-job-history-content table');
                    var page = +table.attr('data-page');
                    if (isNaN(page)){
                        page = 1;
                    }
                    var jhc = table.find('tbody');
                    jhc.html("");
                    var jhm = appContext.find('.blast-history-meta');
                    var job, ul, i;
                    $(".blast-job-history-content .job-history-controls").html("");
                    BlastApp.printTableFilter(table, 
                            $(".blast-job-history-content .job-history-controls"),
                            blastTypesFilter, "Filter by Blast Type: ", "blast-filter");
                    for(i = 0; i < data.result.length; i++){
                        job = data.result[i];
                        if(job.appId.indexOf("blas") < 0){
                            continue;
                        }
                        BlastApp.printJobDetails(job, jhc, jhm);
                    }
                    if(table.attr("data-filter")){
                        BlastApp.filterBy(table, table.attr("data-filter"), 1, false);
                    }
                    BlastApp.showPage(table, data.result.length, 10, 1, page);
                    //ul = BlastApp.buildPager(table, data.result, 10, page);
                    //BlastApp.appendPager(table, ul);
                }
            },
            function(){
                BlastApp.jobError('Couldn\'t retrieve job list. Please try again later');
            }
        );
        appContext.find('.blast-job-history-panel .job-history-message').addClass('hidden');
        BlastApp._jobListChecker = setInterval(BlastApp.checkJobListStatus, 2500);
    };

    //on form change add class to form element to pick out and add to app description
    appContext.find('form').change(function (event) {
        $(event.target).addClass('form-changed');
    });

    //submit form
    appContext.find('.form-submit').click(function (event) {
        event.preventDefault();//stop form submission
        //clearInterval(BlastApp._jobListChecker);
        
        //appContext.find('.blast-errors').addClass('hidden');
        //appContext.find('.blast-submit').addClass('hidden');
        //appContext.find('.job-monitor').removeClass('hidden');
        appContext.find('.job-status .job-status-message').html('Uploading data.');
        appContext.find('.form-submit').prop('disabled', true);
        var Agave = window.Agave;

        //set BLAST job name
        var name = appContext.find('#jobName').val();
        var now = new Date().getTime();
        BLAST_CONFIG.now = now;
        name = name.replace('%DATESTAMP%', now);
        name = name.replace('%BLASTTYPE%', BlastApp.getUserAppId());
        name = name.replace(/[^0-9A-Z\-_ ]/, '-');
        if(console){
            console.log('Creating BLAST job: ' + name + ' ');
        }
        BLAST_CONFIG.name = name;

        //grab changed advanced options
        var changedAdvOptions = appContext.find('.advanced-blast-options').find('.form-changed');
        for(var i =0; i < changedAdvOptions.length; i++) {
          console.log(changedAdvOptions[i].id + ' = ' + changedAdvOptions[i].value);
          BLAST_CONFIG.parameters[changedAdvOptions[i].id] = changedAdvOptions[i].value;
        }

        //grab basic options
        var blastOptions = appContext.find('.blast-options').find('input, select');
        var element;
        for(i = 0; i < blastOptions.length; i++){
            element = blastOptions[i];
            console.log(element.id + ' = ' + element.value);
            BLAST_CONFIG.parameters[element.id] = element.value;
        }

        //get blast type and add to app instance
        BlastApp.blastType = BlastApp.getUserAppId();
        BLAST_CONFIG.parameters.blast_application = blastTypes[BlastApp.blastType].app;
        BlastApp.outputFile = BlastApp.username + '/archive/jobs/blast-' + BlastApp.now + '/' + BlastApp.blastType + '_out';

        //get databases and add to app instance
        var dbs = '';
        appContext.find('[name="blast-dbs"]:checked').each(function(){
            dbs +=$(this).val() + ' ';
        });
        if(dbs.length > 0) {
            BLAST_CONFIG.parameters.database = dbs;
        } else {
            //todo error saying you have to select at least one DB
            $('.databases-panel').addClass('text-danger');
            appContext.find('.blast-submit').removeClass('hidden');
            appContext.find('.job-monitor').addClass('hidden');
            BlastApp.jobError('You must select at least one database.');
            $(window).scrollTop(0, 'slow');
            return false;
        }

        //Show job history
        appContext.find('.blast-job-history-panel .job-history-message').removeClass('hidden');
        appContext.find('.blast-job-history-panel .panel-body').collapse('show');
        appContext.find('.blast-job-history-panel .panel-title').removeClass('collapsed');
        $('html, body').animate({
                scrollTop: $('.blast-job-history-panel').offset().top - 30
            });

        //upload file from contents of input form text area
        var blob, formData, inputFileName, sFile;
        formData = new FormData();
        var sequencePaste = $("#edit-sequence-input").val();
        var sequenceFiles = $('[name="blast-sequence-file"]')[0].files;
        if(sequencePaste.length > 10 || sequenceFiles.length > 0){
          if(sequencePaste.length > 10){
            blob = new Blob([$('#edit-sequence-input').val()], {type: 'text/plain'});
            inputFileName = $('[name="blast-paste-sequence-name"]').val() + '_' + BlastApp.blastType + '-' +  BlastApp.now + '.txt';
          }else{
            sFile = sequenceFiles[0];
            blob = sFile;
            inputFileName = $('[name="blast-sequence-upload-name"]').val() + '_' + BlastApp.blastType + '-' +  BlastApp.now + '.txt';
          }
            console.log('uploading ' + inputFileName);
            formData.append('fileToUpload',blob,inputFileName);

            Agave.api.files.importData(
            {systemId: BLAST_CONFIG.archiveSystem , filePath: BlastApp.username + '/' + BLAST_CONFIG.mainFolder + '/' + BLAST_CONFIG.uploadFolder + '/' + BLAST_CONFIG.sequencesFolder, fileToUpload: blob, fileName: inputFileName},
            {requestContentType: 'multipart/form-data'},
            function(resp) {
                //successful upload, but need to check for agave errors
                if(resp.obj.status !== 'success') {
                    BlastApp.jobError('Could not upload file. ' + resp.obj.message);
                }
                //actual successful upload.
                //submit the job
                appContext.find('.job-status .job-status-message').html('Submitting job.');
                BLAST_CONFIG.inputs.query = 'agave://araport-storage-00/'+BlastApp.username + '/' + BLAST_CONFIG.mainFolder + '/' + BLAST_CONFIG.uploadFolder + '/' + BLAST_CONFIG.sequencesFolder + '/' + inputFileName;
                console.log('submitting job:', BLAST_CONFIG);
                console.log('submitting job:', JSON.stringify(BLAST_CONFIG));
                //submit the job
                Agave.api.jobs.submit({'body': JSON.stringify(BLAST_CONFIG)},
                    function(jobResponse) { //success
                        console.log('Job Submitted.');
                        //appContext.find('.blast-submit').addClass('hidden');
                        //appContext.find('.job-monitor').removeClass('hidden');
                        if(jobResponse.obj.status === 'success') {

                            //job successfully submitted, find out the status
                            BlastApp.jobId = jobResponse.obj.result.id;
                            BlastApp.status = jobResponse.obj.result.status;
                            //is the job done? (unlikely)
                            if(BlastApp.status === 'FINISHED') {
                                console.log('job immediately finished');
                                BlastApp.updateStatusIcon("success");
                                BlastApp.jobFinished(jobResponse.obj.result);
                            } else { //more likely we need to poll the status
                                BlastApp.status = jobResponse.obj.result.status;
                                appContext.find('.job-status .job-status-message').html('Job Status is ' + BlastApp.status);
                                if((BlastApp.status === 'PENDING')) {
                                    BlastApp.updateStatusIcon("pending");
                                    setTimeout(function() { BlastApp.checkJobStatus(); }, 5000);
                                }
                            }
                            setTimeout(function() {
                                BlastApp.getJobList(); }, 500);
                        } else {
                            console.log('Job did not successfully submit.', jobResponse.data.message);
                            //todo better error handling here
                            BlastApp.jobError('Job did not successfully submit. ' + jobResponse.data.message);
                        }
                    } ,
                    function(err) { //fail
                        //agave.api failed
                        console.log('Job did not successfully submit.', err);
                        BlastApp.jobError('Job did not successfully submit.', err);
                    }
                );

            }, function() {
                BlastApp.jobError('Could not upload file.');
                return false;
            }
        );
      }
    }); //end click submit
    //event handler for download button click
    appContext.find('.blast-download-button').click( function() {
        BlastApp.downloadResults();
    });

    BlastApp.checkRunEnable = function(){
        var sFiles = $('[name="blast-sequence-file"]')[0].files;
        var dbFiles = $('[name="blast-db-file"]')[0].files;
        var dbs = appContext.find('[name="blast-dbs"]:checked');
        if(!dbs.length && !dbFiles.length) {
            return false;
        }
        if(appContext.find('#edit-sequence-input').val().length < 10 && !sFiles.length)
        {
            return false;
        }
        return true;
    };

    BlastApp.enableRunButton = function(){
        if (BlastApp.checkRunEnable()){
            appContext.find('.form-submit').prop('disabled', false).removeClass('disabled').removeClass('btn-default').addClass('btn-success');
        }else{
            appContext.find('.form-submit').prop('disabled', true).removeClass('btn-success').addClass('disabled').addClass('btn-default');
        }
    };
    BlastApp.enableRunButton();

    //Check if the user has inputted a sequence and selected a DB
    appContext.find('#edit-sequence-input').on('input', function(){
        BlastApp.enableRunButton();
    });

    appContext.find('[name="blast-sequence-file"]').change(function(){
        BlastApp.enableRunButton();
    });

    //Horizontal Tabs
    appContext.find(".htab-wrapper .htab-target").hide();
    var htabWrappers = appContext.find(".htab-wrapper");
    htabWrappers.each(function(){
        var activeTab;
        var element = $(this);
        activeTab = element.find('.htab.active .htab-link');
        element.find(activeTab[0].getAttribute('data-target')).show();
    });
    appContext.find(".htab-wrapper .htab-link").click(function(e){
        e.preventDefault();
        var el = $(this);
        var htabWrapper = el.parent().parent().parent();
        var links = htabWrapper.find(".htab-link");
        for(var i = 0; i < links.length; i++){
            $(links[i]).parent().removeClass("active");
        }
        el.parent().addClass("active");
        var target = htabWrapper.find("" + this.getAttribute("data-target") + "");
        htabWrapper.find(".htab-target").hide();
        target.show();
    });

    //Checking which blast they choose
    var showDBType = function(){
        var checked = appContext.find('[name="appId"]:checked');
        var DBType = blastTypes[checked.val()].dbtype;
        if(DBType == "nucl"){
            appContext.find(".databases-panel .prot-wrapper").hide();
            appContext.find(".databases-panel .nucl-wrapper").show().removeClass('col-md-6').addClass('col-md-12');
        }else{
            appContext.find(".databases-panel .nucl-wrapper").hide();
            appContext.find(".databases-panel .prot-wrapper").show().removeClass('col-md-6').addClass('col-md-12');
        }
    }
    showDBType();
    appContext.find('[name="appId"]').change(showDBType);
  /* Initialize Agave */
  window.addEventListener('Agave::ready', function() {
    //var Agave, help, helpItem, helpDetail, methods, methodDetail;
    var Agave;
    Agave = window.Agave;
    BlastApp.getProfile(Agave); //get the user info like username
    BlastApp.setupAppId(Agave);
    BlastApp.getDatabasesMetadata(Agave); //load the Databases
    BlastApp.getJobList();
  });

  /* reload button */
  //todo - this needs to not just reload the page to play nice in multi-app environment
  appContext.find('.blast-reload-button').click(function(){
    location.reload();
  });

  /* function to remove/add collapsed class on panel title dropdown. In production the toggle function doesn't do this */
  appContext.find("[data-toggle=collapse]").click(function(){
      var el = $(this);
      if(el.hasClass("collapsed")){
          el.removeClass("collapsed");
      }else{
          el.addClass("collapsed");
      }
  });

  //********* FILE BROWSER ************//

})(window, jQuery);

/*global jQuery, _*/
(function(window, $, _, undefined) {
  'use strict';

  // ES6-style promises
  //window.ES6Promise.polyfill();

  var $appContext = $('.file-browser');
  var templates = {};
  var Agave;
  var currentUser;
  var systems;
  var currentSystem;
  var currentFiles;
  var currentPath;

  templates.systems = _.template(
    '<option value="">Choose a system to browse</option>' +
    '<optgroup label="Private Systems"><% _.each(privateSystems, function(system) { %><option value="<%= system.id %>">(<%= system.id %>) <%= system.name %></option><% }); %></optgroup>' +
    '<optgroup label="Public Systems"><% _.each(publicSystems, function(system) { %><option value="<%= system.id %>">(<%= system.id %>) <%= system.name %></option><% }); %></optgroup>'
    );
  templates.files = _.template(
    '<% _.each(files, function(file, i) { %><tr data-file-index="<%= i %>"><td><%= file.name %></td>'+
    '<td><i class="fa fa-<%= file.type === \'dir\' ? \'folder\' : \'file\' %>"></i> <%= file.mimeType %></td>' +
    '<td><% if (file.type === \'file\') { %><%= niceFileSize(file.length) %><% } %></td>' +
    '<td><%= fileActions({file: file, fileSelected: fileSelected}) %></td></tr><% }); %>'
    );
  
  templates.fileActions = _.template(
    '<% if (file.type === \'file\') { %>' +
      '<% if (file.permissions === \'READ\' || file.permissions === \'READ_WRITE\' || file.permissions === \'ALL\' ) { %>' +
        '<button title="Preview" name="preview" class="btn btn-xs btn-info"><i class="fa fa-eye"></i><span class="sr-only">Preview</span></button> ' +
        '<button title="Select" name="select" class="btn btn-xs ' + 
        '<% if (fileSelected == file.path) { %> btn-success <% } else { %> btn-default <%}%>"><span class="glyphicon glyphicon-check"></span> <span class="sr-only">Select</span></button> ' +
        '<button title="Unselect" name="unselect" class="btn btn-xs btn-default"><span class="glyphicon glyphicon-unchecked"></span> <span class="sr-only">Unselect</span></button> ' +
        '<% } %>' +
    '<% } else if (file.type === \'dir\'){%>' +
    '<button title="Open" name="open" class="btn btn-xs btn-default"><i class="fa fa-folder-open"></i><span class="sr-only">Open</span></button> ' +
    '<% } %>'
    );
/*
  templates.fileActions = _.template(
    '<% if (file.type === \'file\') { %>' +
      '<% if (file.permissions === \'READ\' || file.permissions === \'READ_WRITE\' || file.permissions === \'ALL\' ) { %>' +
        '<button title="Preview" name="preview" class="btn btn-xs btn-info"><i class="fa fa-eye"></i><span class="sr-only">Preview</span></button> ' +
        '<button title="Download" name="download" class="btn btn-xs btn-primary"><i class="fa fa-cloud-download"></i><span class="sr-only">Download</span></button> ' +
      '<% } if (file.permissions === \'READ_WRITE\' || file.permissions === \'ALL\') { %>' +
        '<button title="Delete" name="delete" class="btn btn-xs btn-danger"><i class="fa fa-times"></i><span class="sr-only">Delete</span></button> ' +
      '<% } %>' +
    '<% } else if (file.type === \'dir\'){%>' +
    '<button title="Open" name="open" class="btn btn-xs btn-default"><i class="fa fa-folder-open"></i><span class="sr-only">Open</span></button> ' +
    '<% } %>'
    );
*/
  var nextSuffix = {
    'bytes': 'KB',
    'KB': 'MB',
    'MB': 'GB',
    'GB': 'TB',
    'TB': 'PB'
  };

  function niceFileSize(size, suffix) {
    suffix = suffix || 'bytes';
    if (size > 1024 && nextSuffix[suffix]) {
      return niceFileSize( size / 1024, nextSuffix[suffix]);
    } else {
      return size.toFixed(2) + ' ' + suffix;
    }

  }

  function showAlert(opts) {
    var $msg = $('<div class="alert alert-' + (opts.type || 'info') + ' alert-dismissible">');
    $msg.append('<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>');
    $msg.append(opts.message);
    $('.alerts', $appContext).append($msg);
    if (opts.autoDismiss) {
      setTimeout(function() {
        $msg.remove();
      }, opts.autoDismiss);
    }
  }

  function indicator(opts) {
    opts = opts || {};
    if (opts.show) {
      $('.indicator', $appContext).addClass('show');
    } else {
      $('.indicator', $appContext).removeClass('show');
    }
  }

  function selectNearestFilebrowser(el){
      return el.closest('.file-browser');
  }

  function init() {
    $('select[name="system"]', $appContext)
    .html(templates.systems({
      privateSystems: _.filter(systems, { public: false }),
      publicSystems: _.filter(systems, { public: true })
    }))
    .on('change', function() {
      selectSystem(this.value);
    });

    $('a[name="directory-level-up"]', $appContext).on('click', function(e) {
      e.preventDefault();
      $appContext = selectNearestFilebrowser($(this));
      var path = currentPath.split('/').slice(0, -1).join('/');
      path = path || systemDefaultPath( currentSystem );
      openPath( path );
    });

    $('form[name="system-path"]', $appContext).on('submit', function(e) {
      console.log(e);
      e.preventDefault();
      $appContext = selectNearestFilebrowser($(this));
      var path = $('input[name="current-path"]', $appContext).val();
      path = path || systemDefaultPath( currentSystem );
      openPath( path ).then(false, function(err) {
        $('input[name="current-path"]', $appContext).val(currentPath);
        showAlert({message: err.obj.message + ': ' + path, type: 'danger', autoDismiss: 3000});
      });
    });
  }

  function selectSystem(systemId) {
    $('.current-system-id').text(systemId || '#');
    if (systemId) {
      indicator({show: true});
      new Promise(function(resolve, reject) {
        Agave.api.systems.get({systemId: systemId}, function (resp) { resolve(resp.obj.result); }, reject);
      })
      .then(function(system) {
        currentSystem = system;
        return openPath( systemDefaultPath(currentSystem) );
      })
      .then(indicator, indicator);
    } else {
      currentSystem = currentPath = null;
      displayFiles();
    }
  }

  function systemDefaultPath(system) {
    var path;
    if ( system.id === 'araport-public-files' ) {
      path = '/TAIR10_genome_release';
    } else if ( system.public ) {
      path = '/' + currentUser.username + '/blastplus';
    } else {
      path = system.storage.homeDir;
    }
    return path;
  }

  function displayFiles(files) {
    if (files) {
      if ( files[0].name === '.' ) {
        files.shift();
      }
      currentFiles = files;
      $('.display-files', $appContext).html( templates.files( { files: currentFiles, niceFileSize: niceFileSize, fileActions: templates.fileActions, fileSelected: $('input[name="sequence-file-selected"]').val() } ) );

      $('button[name="open"]', $appContext).on( 'click', function(e) {
        e.preventDefault();
        $appContext = selectNearestFilebrowser($(this));
        var fileIndex = parseInt($(e.currentTarget).closest('tr').attr('data-file-index'));
        openPath( currentFiles[fileIndex].path );
      });

      $('button[name="preview"]', $appContext).on( 'click', function(e) {
        e.preventDefault();
        $appContext = selectNearestFilebrowser($(this));
        var fileIndex = parseInt($(e.currentTarget).closest('tr').attr('data-file-index'));
        previewFile( currentFiles[fileIndex] );
      });

      $('button[name="download"]', $appContext).on( 'click', function(e) {
        e.preventDefault();
        $appContext = selectNearestFilebrowser($(this));
        var $button = $(this);
        var content = $button.html();
        $button.attr('disabled', true).html('<i class="fa fa-spinner fa-spin"></i>');
        var fileIndex = parseInt($(e.currentTarget).closest('tr').attr('data-file-index'));
        downloadFile( currentFiles[fileIndex] ).then(function() {
          $button.attr('disabled', null).html(content);
        }, function() {
          $button.attr('disabled', null).html(content);
        });
      });

      $('button[name="delete"]', $appContext).on( 'click', function(e) {
        e.preventDefault();
        $appContext = selectNearestFilebrowser($(this));
        var $button = $(this);
        if (window.confirm('Are you sure you want to delete this file? This operation cannot be undone.')) {
          var fileIndex = parseInt($(e.currentTarget).closest('tr').attr('data-file-index'));
          deleteFile( currentFiles[fileIndex] ).then(function(file) {
            $button.closest('tr').remove();
            showAlert({
              message: 'The file ' + file.name + ' has been deleted.',
              type: 'success',
              autoDismiss: 5000
            });
          },
          function(error) {
            showAlert({
              message: error.message,
              type: 'danger',
              autoDismiss: 5000
            });
          });
        }
      });

      $('button[name="select"]', $appContext).on('click', function(e){
        e.preventDefault();
        $appContext = selectNearestFilebrowser($(this));
        var $button = $(this);
        var fileIndex = parseInt($(e.currentTarget).closest('tr').attr('data-file-index'));
        $('input[name="sequence-file-selected"]', $appContext).val(currentFiles[fileIndex].path);
        $('.display-files tr', $appContext).each(function(){
            var buttons = $(this.cells[3]);
            buttons.find('button[name="select"]').removeClass('btn-success').addClass('btn-default');
        });
        $button.removeClass('btn-default').addClass('btn-success');
        $('.help-select-filename', $appContext).text(currentFiles[fileIndex].path);
      });

    } else {
      currentFiles = null;
      $('.display-files', $appContext).empty();
      $('input[name="current-path"]', $appContext).val(null);
    }
  }

  function openPath(path) {
    $('input[name="current-path"]', $appContext).val(path);
    indicator({show:true});
    var p = new Promise(function( res, rej ) {
      Agave.api.files.list(
        { systemId: currentSystem.id, filePath: path },
        function(resp) {
          currentPath = path;
          res(resp.obj.result);
        },
        rej
      );
    });
    p.then(displayFiles).then(indicator, indicator);
    return p;
  }

  function deleteFile(file) {
    var promise = new Promise(function(resolve, reject) {
      Agave.api.files.delete({systemId: file.system, filePath: file.path},
        function() { resolve(file); },
        reject
      );
    });

    promise.then(false, function(err) {
      showAlert({ message: err.message, type: 'danger', autoDismiss: 5000 });
    });

    return promise;
  }

  function downloadFile(file) {
    var promise = new Promise(function(resolve, reject) {
      var req = Agave.api.files.download({systemId: file.system, filePath: file.path}, {mock: true});
      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function() {
        if (this.readyState === 4) {
          if (this.status === 200) {
            resolve(this.response);
          } else {
            var reader = new FileReader();
            reader.onload = function() {
              reject(JSON.parse(reader.result));
            };
            reader.readAsText(this.response);
          }
        }
      };
      xhr.open(req.method, req.url);
      xhr.setRequestHeader('Authorization', 'Bearer ' + Agave.token.accessToken);
      xhr.responseType = 'blob';
      xhr.send();
    });

    promise.then(
      function(fileData) {
        window.saveAs(fileData, file.name);
      },
      function(err) {
        showAlert({ message: err.message, type: 'danger', autoDismiss: 5000 });
      }
    );

    return promise;
  }

  function previewFile(file) {
    var $preview = $('<div class="file-browser-app-preview loading"><div class="file-browser-app-preview-overlay"></div><div class="file-browser-app-preview-header container"><header><button type="button" data-dismiss="preview" class="btn btn-danger btn-sm pull-right">&times;</button><h4 class="file-browser-app-preview-title"></h4></header></div><div class="container file-browser-app-preview-item-wrapper"><div class="file-browser-app-preview-item"></div></div></div>');
    $('body').append($preview);

    $('.file-browser-app-preview-title', $preview).text(file.name);

    new Promise(function(resolve, reject) {
      var req = Agave.api.files.download({systemId: file.system, filePath: file.path}, {mock: true});
      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function() {
        if (this.readyState === 4) {
          if (this.status === 200) {
            var blobUrl;
            if (file.mimeType === 'application/pdf') {
              // object
              blobUrl = URL.createObjectURL( this.response );
              $('<object>')
                .attr('data', blobUrl)
                .attr('class', 'embed-responsive-item')
                .on('load', function() {
                  URL.revokeObjectURL(blobUrl);
                })
                .appendTo('.file-browser-app-preview-item', $preview);
              $('.file-browser-app-preview-item', $preview).addClass('embed-responsive embed-responsive-4by3');
            } else if (file.mimeType.indexOf('image') === 0) {
              // img
              blobUrl = URL.createObjectURL( this.response );
              $('<img>')
                .attr('class', 'img-responsive')
                .attr('src', blobUrl)
                .on('load', function() {
                  URL.revokeObjectURL(blobUrl);
                })
                .appendTo('.file-browser-app-preview-item', $preview);
            } else {
              // text
              $('<pre>').appendTo('.file-browser-app-preview-item', $preview).text(this.response);
            }
            resolve(true);
          } else {
            if (this.responseType === 'blob') {
              var reader = new FileReader();
              reader.onload = function() {
                reject(JSON.parse(reader.result));
              };
              reader.readAsText(this.response);
            } else {
              reject(JSON.parse(this.response));
            }
          }
        }
      };
      xhr.open(req.method, req.url);
      xhr.setRequestHeader('Authorization', 'Bearer ' + Agave.token.accessToken);
      if (file.mimeType === 'application/pdf' || file.mimeType.indexOf('image') === 0) {
        xhr.responseType = 'blob';
      } else {
        xhr.responseType = 'text';
      }
      xhr.send();
    }).then(function() {
      $preview.removeClass('loading');
      $('.file-browser-app-preview-overlay, [data-dismiss="preview"]', $preview).on('click', function() { $preview.remove(); });
    }, function(err) {
      $preview.remove();
      showAlert({ message: err.message, type: 'danger', autoDismiss: 5000 });
    });
  }

  /* Generate Agave API docs */
  window.addEventListener('Agave::ready', function() {
    Agave = window.Agave;

    indicator({show: true});

    Agave.api.profiles.me({}, function(resp) {
      currentUser = resp.obj.result;
    });

    new Promise( function( res, rej ) {
      Agave.api.systems.list({},
        function(resp) {
          systems = _.chain(resp.obj.result)
            .filter({ 'type': 'STORAGE' }) // only show storage systems
            .reject({ 'id': 'araport-compute-00-storage' }) // hide this one; not browsable
            .value();
          res(systems);
        },
        rej
      );
    })
    .then(init)
    .then(function() {
      var defaultSystems = _.filter(systems, { 'default': true });
      if (defaultSystems.length) {
        $('select[name="system"]', $appContext).val(defaultSystems[0].id);
        selectSystem(defaultSystems[0].id);
      }
    });
  });

})(window, jQuery, _);
