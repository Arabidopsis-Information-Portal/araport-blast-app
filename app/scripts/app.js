(function(window, $, undefined) {
    'use strict';

  //the different blast types and their app IDs
  var blastTypes = {
    'blastn' : 'ncbi-blastn-2.2.29u5',
    'blastp':'ncbi-blastp-2.2.29u3',
    'blastx':'ncbi-blastx-2.2.29u3',
    'tblastn':'ncbi-tblastn-2.2.29u3',
    'tblastx':'ncbi-tblastx-2.2.29u3',
  };
  
  //app template
  var BLASTN = {
        'name': 'blast-test-%DATESTAMP',
        'appId': 'ncbi-blastn-2.2.29u3',
        'queue': 'normal',
        'nodeCount': 1,
        'maxMemoryPerNode': 1,
        'processorsPerNode': 1,
        'requestedTime': '00:30:00',
        'archive': true,
        'archivePath': '%USERNAME/archive/jobs/blastn-test-%DATESTAMP',
        'archiveSystem': 'araport-storage-00',
        /*
        'notifications': [{
             'url':'mock@tacc.utexas.edu',
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

    //should be done for me by Agave stuff
    var Agave = {};
    Agave.token = '';
    Agave.baseUrl = 'https://api.araport.org/';
    Agave.profiles = Agave.baseUrl + 'profiles/v2/';
    Agave.me = Agave.profiles + 'me/';
    Agave.files   = Agave.baseUrl + 'files/v2/media/system/';
    Agave.header  = {Authorization: 'Basic: ' + Agave.token};
    Agave.jobs    = Agave.baseUrl + 'jobs/v2/';
    Agave.files   = Agave.baseUrl + 'files/v2/media/system/';
    Agave.runningStates  = ['PENDING', 'STAGING_INPUTS', 'CLEANING_UP', 'ARCHIVING', 'STAGING_JOB', 'RUNNING', 'PAUSED', 'QUEUED', 'SUBMITTING', 'STAGED', 'PROCESSING_INPUTS', 'ARCHIVING_FINISHED'];
    Agave.errorStates    = ['KILLED', 'FAILED', 'STOPPED','ARCHIVING_FAILED'];
    Agave.finishedStates = ['FINISHED'];

    var Blastn = {}; //info dumping ground
    //this file is the list of available installed databases to blast against
    Blastn.databaseListing = Agave.files + 'araport-compute-00-storage/blast/index.json';
//    Blastn.databases = {};

    //using date and time as an identifier. probably should switch this to a uuid or something   
    if (!Date.now) {
        Date.now = function() { return new Date().getTime(); };
    }
    var now = Date.now();
    BLASTN.archivePath = BLASTN.archivePath.replace('%DATESTAMP',now);
    BLASTN.name = BLASTN.name.replace('%DATESTAMP',now);

    //this should be done for me already too
    Agave.username = '';


    //get the user's profile info, mostly for the username
    Blastn.getProfile = function(token) {
        console.log('Blastn.getProfile called');
        if(Agave.username.length <= 0) {
            var jxhr = $.ajax({
                headers: {
                    'Authorization': 'Bearer ' + Agave.token
                },
                type: 'GET',
                url: Agave.me,
                dataType: 'json',  

            }).done(function(json) {
                Agave.username = json.result.username;
                BLASTN.archivePath = BLASTN.archivePath.replace('%USERNAME',Agave.username);
                Blastn.uploadPath  = Agave.files +'araport-storage-00/' + Agave.username + '/';
                
                console.log(Agave.username);
            }).error(function(err) {
                Blastn.status = 'ERROR';
                //todo - something useful here like error handling or something
                console.log('Unable to look up username ' + err);
            });
        } else {
            console.log('profiles not called ' + Agave.username.length);
        }
    };
  
    //  
    Blastn.checkJobStatus = function(token, jobId) {
        console.log('Blastn.checkJobStatus ' + token + ' : ' + jobId);
        console.log('Blastn.status = ' + Blastn.status);
        if(Agave.runningStates.indexOf(Blastn.status) >= 0) {
            $('.job-status').html('Checking...');
            $.ajax( {
                  headers: {
                    'Authorization': 'Bearer ' + token
                },
                type: 'GET',
                url: Agave.jobs + jobId,
                dataType: 'json',       
            }).done(function(json) {
                console.log('checked job status, it is ' + json.result.status);
                Blastn.status = json.result.status;
                $('.job-status').html(Blastn.status);
                if(Agave.runningStates.indexOf(Blastn.status) >= 0) {
                    console.log('ok, here we go again because Blastn.status =' + Blastn.status);
                    setTimeout(function() { Blastn.checkJobStatus(Agave.token, Blastn.jobId); }, 10000);
                } else if(Agave.errorStates.indexOf(Blastn.status) >= 0) {
                    console.log('found ' + Blastn.status + ' in Agave.errorStates ' + Agave.errorStates + ' with indexOf=' + Agave.errorStates.indexOf(Blastn.status));
                    Blastn.jobError();
                } else if(Agave.finishedStates.indexOf(Blastn.status) >=0) {
                    Blastn.jobFinished(json.result);
                } else {
                    console.log('unknown job state! =' + Blastn.status); 
                }
            }).error(function() {
                Blastn.status = 'ERROR';
                //todo - something useful here like error handling or something
            });
        }
    };
    
    Blastn.jobFinished = function(result) {
        console.log('Yay! Job is really really finished!');
        Blastn.result = result;
        console.log(Blastn.result);
        console.log('getting output file ' + Blastn.outputFile);
        //now go get the output file and stuff it into the page
        var jxhr = $.ajax({
            headers: {
                'Authorization': 'Bearer ' + Agave.token
            },
            type: 'GET',
            url: Blastn.outputFile,
        }).done(function(output) { 
            //stuff resulting info into page
            console.log(output);
            $('.job-output').html(output);
        })
        .fail(function() {
            console.log('Could not retrieve output from job.');
        });      
    };
    Blastn.jobError = function() {
        console.log('Boo! Job is in an error state!');
    };    

    Blastn.getDatabases = function() {
        console.log('getDatabases');
        console.log(Blastn.databases);
        console.log(!Blastn.databases);
        if(Blastn.databases) { return; }
        //Go fetch the list of available databases to blast against
        var jxhr = $.ajax({
            headers: {
                'Authorization': 'Bearer ' + Agave.token
            },
            type: 'GET',
            url: Blastn.databaseListing,
            dataType: 'json',  

        }).done(function(json) { 
            Blastn.databases = json;
            //console.log( json );
            //todo - check for empty databases response
            var nukes = '';
            var peps  = '';
            json.databases.forEach(
                function(el, index, array) {
                    //console.log(el);
                    var dbEl = '<div class="checkbox"><label><input type="checkbox" class="blast-database" value="'+el.filename+'">'+el.label+'</label></div>';
                    if(el.type === 'nucleotide') {
                        nukes += dbEl;
                    } else {
                        peps += dbEl;
                    }
                }
            );
            $('.nucleotides').html(nukes);
            $('.peptides').html(peps);
        }
        ).fail(function() {
            console.log('Failed to find list of available databases.');
            $('.nucleotides').html('Unable to find available databases!');
        });
    
        //set 'fetching' message
        $('.nucleotides').html('Fetching available databases');
    };
    
    $('#token').on('paste change',function (event) {
        console.log('paste or change');
        console.log(event.type);
        setTimeout(function(e) {
            if(($('#token').val().length > 0) && (Agave.token != $('#token').val())) {
                Agave.token = $('#token').val();
            }
            Blastn.getProfile(Agave.token);
            Blastn.getDatabases();
        }, 100);
    });
        
    //on form change add class to form element to pick out and add to app description
    $('form').change(function (event) {
        console.log(event.target);
        $(event.target).addClass('form-changed');
    });    

    //gather the items that have changed in the advanced form and add just those for the app submit
    $('.form-submit').click(function (event) {
        event.preventDefault();//stop form submission

        //grab the Agave token from the form (this has to change eventually as well)
        if($('#token').val().length > 0) {
            Agave.token = $('#token').val();
        }
        
        //grab changed advanced options
        var changedAdvOptions = $('.advanced-blast-options').find('.form-changed');
        for(var i =0; i < changedAdvOptions.length; i++) {
          console.log(changedAdvOptions[i].id + ' = ' + changedAdvOptions[i].value);
          BLASTN['parameters'][changedAdvOptions[i].id] = changedAdvOptions[i].value;
        }
        
        //get blast type and add to app instance
        Blastn.blastType = $('#appId').val();
        BLASTN.appId = blastTypes[Blastn.blastType];
        Blastn.outputFile = Agave.files + 'araport-storage-00/' + Agave.username + '/archive/jobs/blastn-test-'+ now + '/' + Blastn.blastType + '_out';
        
        //get databases and add to app instance
        var dbs = '';
        $('.blast-database:checked').each(function(){
            dbs +=$(this).val() + ' ';
        });
        if(dbs.length > 0) {
            BLASTN.parameters.database = dbs;
        } else {
            //todo error saying you have to select at least one DB
        }
                      
        console.log(BLASTN);       
        
        //upload file from contents of input form text area
        var blob = new Blob([$('#edit-sequence-input').val()], {type: 'text/plain'});
        var formData = new FormData();
        var inputFileName = now+'.txt';
        formData.append('fileToUpload',blob,now+'.txt');
        
        var xhr = new XMLHttpRequest();
        xhr.open("POST", Blastn.uploadPath, true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + Agave.token);
        xhr.timeout = 0;        
        xhr.onload = function () {
            
            var parsedJSON = JSON.parse(xhr.response);
            parsedJSON = parsedJSON.result;
            
            if (xhr.status === 200 || 202) {     //if the upload was good, then submit job       
                BLASTN.inputs.query = 'agave://araport-storage-00/'+Agave.username + '/' + inputFileName;
                console.log('submitting:');
                console.log(BLASTN);
                
                //submit the job
                var jxhr = $.ajax({
                    headers: {
                        'Authorization': 'Bearer ' + Agave.token,
                        'Content-type': 'application/json',
                    },
                    type: 'POST',
                    url: Agave.jobs,
                    data: JSON.stringify(BLASTN), 
                }).done(function (jobResponse) {  //job should have successfully submitted
                    console.log('JOB SUBMISSION DONE!');
                    console.log(jobResponse);
        
                    $('.blast-submit').addClass('hidden');
                    $('.job-monitor').removeClass('hidden');
                    if(jobResponse.status === 'success') {
                        //do stuff!!!
                        Blastn.jobId = jobResponse.result.id;
                        Blastn.status = jobResponse.result.status;
                        //is the job done? (unlikely)
                        if(Blastn.status === 'FINISHED') {
                            console.log('job immediately finished, yay!');
                            Blastn.jobFinished(jobResponse.result);
                        } else { //more likely we need to poll the status   
                            Blastn.status = jobResponse.result.status;
                            $('.job-status').html('Job Status is ' + Blastn.status);
                            if((Blastn.status === 'PENDING')) {
                                setTimeout(function() { Blastn.checkJobStatus(Agave.token, Blastn.jobId); }, 10000);
                            }
                        }
                    } else {
                        //failure
                        //todo
                        console.log('jobResponse.status was not success')
                    }
        
                })
                .fail(function (msg) {
                    //todo
                    console.log('FAILED TO SUBMIT JOB! Sent:');
                    console.log(BLASTN);
                    console.log(msg);
                });            
            } else {
                //todo
                console.log('something still went wrong with the file upload!!');
                console.log(uploadResponse);
            }
        }
        xhr.onerror = function () {
            //todo
            console.log('booo! upload failed!' + xhr.status);
            console.log(xhr);
        }
       
        xhr.send(formData); //actually make the file upload call
    });

})(window, jQuery);
