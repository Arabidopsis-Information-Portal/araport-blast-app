(function(window, $, undefined) {
    'use strict';


  //app template
  var BLASTN = {
        'name': 'blastn-test-%DATESTAMP',
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

    console.log('Hello AIP Science App!');

    //should be done for me by Agave stuff
    var Agave = {};
    Agave.token = '';
    Agave.baseUrl = 'https://api.araport.org/';
    Agave.files   = Agave.baseUrl + 'files/v2/media/system/';
    Agave.header  = {Authorization: 'Basic: ' + Agave.token};
    Agave.jobs    = Agave.baseUrl + 'jobs/v2/';
    Agave.files   = Agave.baseUrl + 'files/v2/media/system/';
    Agave.runningStates  = ['PENDING', 'STAGING_INPUTS', 'CLEANING_UP', 'ARCHIVING', 'STAGING_JOB', 'RUNNING', 'PAUSED', 'QUEUED', 'SUBMITTING', 'STAGED', 'PROCESSING_INPUTS', 'ARCHIVING_FINISHED'];
    Agave.errorStates    = ['KILLED', 'FAILED', 'STOPPED','ARCHIVING_FAILED'];
    Agave.finishedStates = ['FINISHED'];

    var Blastn = {};
    Blastn.databaseListing = Agave.files + 'araport-compute-00-storage/blast/index.json';



    
    if (!Date.now) {
        Date.now = function() { return new Date().getTime(); };
    }
    var now = Date.now();
    console.log('now' + now);
    BLASTN.archivePath = BLASTN.archivePath.replace('%DATESTAMP',now);
    BLASTN.name = BLASTN.name.replace('%DATESTAMP',now);

    //$('#token').val(Agave.token);
    //use profile to look up the Agave username
    //todo - this^

    //this should be done for me already too
    Agave.username = 'mock';
    BLASTN.archivePath = BLASTN.archivePath.replace('%USERNAME',Agave.username);
    BLASTN.uploadPath  = Agave.files +'araport-storage-00/' + Agave.username + '/';
    BLASTN.outputFile = Agave.files + 'araport-storage-00/' + Agave.username + '/archive/jobs/blastn-test-'+ now + '/blastn_out';
    console.log('BLASTN.uploadPath' + BLASTN.uploadPath);


    BLASTN.checkJobStatus = function(token, jobId) {
        console.log('BLASTN.checkJobStatus ' + token + ' : ' + jobId);
        console.log('BLASTN.status = ' + BLASTN.status);
        if(Agave.runningStates.indexOf(BLASTN.status) >= 0) {
            
            $.ajax( {
                  headers: {
                    'Authorization': 'Bearer ' + token
                },
                type: 'GET',
                url: Agave.jobs + jobId,
                dataType: 'json',       
            }).done(function(json) {
                console.log('checked job status, it is ' + json.result.status);
                BLASTN.status = json.result.status;
                $('.job-status').html('Job Status is ' + BLASTN.status);
                if(Agave.runningStates.indexOf(BLASTN.status) >= 0) {
                    console.log('ok, here we go again because BLASTN.status =' + BLASTN.status);
                    setTimeout(function() { BLASTN.checkJobStatus(Agave.token, BLASTN.jobId); }, 10000);
                } else if(Agave.errorStates.indexOf(BLASTN.status) >= 0) {
                    console.log('found ' + BLASTN.status + ' in Agave.errorStates ' + Agave.errorStates + ' with indexOf=' + Agave.errorStates.indexOf(BLASTN.status));
                    BLASTN.jobError();
                } else if(Agave.finishedStates.indexOf(BLASTN.status) >=0) {
                    BLASTN.jobFinished(json.result);
                } else {
                    console.log('unknown job state! =' + BLASTN.status); 
                }
            }).error(function() {
                BLASTN.status = 'ERROR';
                //todo - something useful here like error handling or something
            });
        }
    };
    
    BLASTN.jobFinished = function(result) {
        console.log('Yay! Job is really really finished!');
        BLASTN.result = result;
        console.log(BLASTN.result);
        //now go get the output file and stuff it into the page
         //Go fetch the output file
        var jxhr = $.ajax({
            headers: {
                'Authorization': 'Bearer ' + Agave.token
            },
            type: 'GET',
            url: BLASTN.outputFile,
            //dataType: 'json',  

        }).done(function(output) { 
            //stuff resulting info into page
            console.log(output);
            $('.job-output').html(output);
        })
        .fail(function() {
            console.log('Could not retrieve output from job.');
        });
 
        
    };
    BLASTN.jobError = function() {
        console.log('Boo! Job is in an error state!');
    };    

    BLASTN.getDatabases = function() {
        //Go fetch the list of available databases to blast against
        var jxhr = $.ajax({
            headers: {
                'Authorization': 'Bearer ' + Agave.token
            },
            type: 'GET',
            url: Blastn.databaseListing,
            dataType: 'json',  

        }).done(function(json) { 
            console.log( json );
            //todo - check for empty databases response
            var nukes = '';
            var peps  = '';
            json.databases.forEach(
                function(el, index, array) {
                    console.log(el);
                    var dbEl = '<div class="checkbox"><label><input type="checkbox" value="'+el.filename+'">'+el.label+'</label></div>';
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
        setTimeout(function(e) {
            if(($('#token').val().length > 0) && (Agave.token != $('#token').val())) {
                Agave.token = $('#token').val();
            }
            BLASTN.getDatabases();
        }, 100);
    });
        
    //on form change add class to form element to pick out and add to app description
    $('form').change(function (event) {
        console.log(event.target);
        $(event.target).addClass('form-changed');
    });    

    //gather the items that have changed in the advanced form and add just those for the app submit
    $('.form-submit').click(function (event) {
        //gather advanced options
        event.preventDefault();
        
        //grab the Agave token from the form (this has to change eventually as well)
        if($('#token').val().length > 0) {
            Agave.token = $('#token').val();
        }
        
        var changedAdvOptions = $('.advanced-blast-options').find('.form-changed');
        console.log('length is ' + changedAdvOptions.length);
        for(var i =0; i < changedAdvOptions.length; i++) {
          console.log(changedAdvOptions[i].id + ' = ' + changedAdvOptions[i].value);
          BLASTN['parameters'][changedAdvOptions[i].id] = changedAdvOptions[i].value;
        }        
        
        //upload file from contents of input form text area
        var blob = new Blob([$('#edit-sequence-input').val()], {type: 'text/plain'});
        var formData = new FormData();
        var inputFileName = now+'.txt';
        formData.append('fileToUpload',blob,now+'.txt');
        
        var xhr = new XMLHttpRequest();
        xhr.open("POST", BLASTN.uploadPath, true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + Agave.token);
        xhr.timeout = 0;        
        xhr.onload = function () {
            
            var parsedJSON = JSON.parse(xhr.response);
            parsedJSON = parsedJSON.result;
            
            if (xhr.status === 200 || 202) {
            
                //BLASTN.inputs.query = parsedJSON._links.self.href;
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
                    //$('.job-monitor').html(JSON.stringify(jobResponse));
                    if(jobResponse.status === 'success') {
                        //do stuff!!!
                        BLASTN.jobId = jobResponse.result.id;
                        BLASTN.status = jobResponse.result.status;
                        //is the job done? (unlikely)
                        if(BLASTN.status === 'FINISHED') {
                            console.log('job immediately finished, yay!');
                            BLASTN.jobFinished(jobResponse.result);
                        } else {
                            
                            BLASTN.status = jobResponse.result.status;
                            $('.job-status').html('Job Status is ' + BLASTN.status);
                            if((BLASTN.status === 'PENDING')) {
                                setTimeout(function() { BLASTN.checkJobStatus(Agave.token, BLASTN.jobId); }, 10000);
                            }
                        }
                    } else {
                        //failure
                        console.log('jobResponse.status was not success')
                    }
        
                })
                .fail(function (msg) {
                    console.log('FAILED TO SUBMIT JOB! Sent:');
                    console.log(BLASTN);
                    console.log(msg);
                });            
            } else {
                console.log('something still went wrong with the file upload!!');
                console.log(uploadResponse);
            }
            
        }
        xhr.onerror = function () {
            console.log('booo! upload failed!' + xhr.status);
            console.log(xhr);
        }
        
        xhr.send(formData);       
        
    });

})(window, jQuery);
