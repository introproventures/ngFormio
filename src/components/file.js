module.exports = function (app) {

  app.config([
    'formioComponentsProvider',
    function (formioComponentsProvider) {
      formioComponentsProvider.register('file', {
        title: 'File',
        template: 'formio/components/file.html',
        settings: {
          input: true,
          tableView: true,
          label: '',
          key: 'file',
          placeholder: '',
          multiple: false,
          defaultValue: '',
          protected: false,
        }
      });
    }
  ]);

  app.directive('formioFileList', [function() {
    return {
      restrict: 'E',
      replace: true,
      scope: {
        files: '=',
        form: '=',
        readOnly: '='
      },
      templateUrl: 'formio/components/formio-file-list.html',
      controller: [
        '$scope',
        function ($scope) {
          $scope.removeFile = function (event, index) {
            event.preventDefault();
            $scope.files.splice(index, 1);
          };

          $scope.fileSize = function (a, b, c, d, e) {
            return (b = Math, c = b.log, d = 1024, e = c(a) / c(d) | 0, a / b.pow(d, e)).toFixed(2) + ' ' + (e ? 'kMGTPEZY'[--e] + 'B' : 'Bytes');
          };
        }
      ]
    };
  }]);

  app.directive('formioFile', [function() {
    return {
      restrict: 'E',
      replace: true,
      scope: {
        file: '=',
        form: '='
      },
      template: '<a href="{{ file.url }}" ng-click="getFile($event)" target="_blank">{{ file.name }}</a>',
      controller: [
        '$scope',
        'Formio',
        '$window',
        '$http',
        '$rootScope',
        function (
          $scope,
          Formio,
          $window,
          $http,
          $rootScope
        ) {
          $scope.getFile = function (evt) {
            switch($scope.file.storage) {
              case 's3':
                // If this is not a public file, get a signed url and open in new tab.
                if ($scope.file.acl !== 'public-read') {
                  evt.preventDefault();
                  Formio.request($scope.form + '/storage/s3?bucket=' + $scope.file.bucket + '&key=' + $scope.file.key, 'GET')
                    .then(function (response) {
                      $window.open(response.url, '_blank');
                    })
                    .catch(function (response) {
                      // Is alert the best way to do this? User is expecting an immediate notification due to attempting to download a file.
                      alert(response);
                    });
                }
                break;
              case 'dropbox':
                evt.preventDefault();
                var dropboxToken = _.result(_.find($rootScope.user.externalTokens, {type: 'dropbox'}), 'token');
                $http({
                  method: 'POST',
                  url: 'https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings',
                  headers: {
                    'Authorization': 'Bearer ' + dropboxToken,
                    'Content-Type': 'application/json',
                  },
                  data: {
                    path: $scope.file.path_lower
                  },
                  disableJWT: true
                }).then(function successCallback(response) {
                  $window.open(response.data.url, '_blank');
                }, function errorCallback(response) {
                  alert(response.data);
                });
                break;
            }
          };
        }
      ]
    };
  }]);

  app.controller('formioFileUpload', [
    '$scope',
    '$rootScope',
    '$window',
    'Upload',
    'Formio',
    'FormioPlugins',
    function(
      $scope,
      $rootScope,
      $window,
      Upload,
      Formio,
      FormioPlugins
    ) {
      $scope.fileUploads = {};

      var plugins = FormioPlugins.get('storage');
      console.log(plugins);

      $scope.removeUpload = function(index) {
        console.log(index);
        delete $scope.fileUploads[index];
      };

      // This fixes new fields having an empty space in the array.
      if ($scope.data && $scope.data[$scope.component.key] === '') {
        $scope.data[$scope.component.key] = [];
      }
      if ($scope.data && $scope.data[$scope.component.key][0] === '') {
        $scope.data[$scope.component.key].splice(0, 1);
      }

      $scope.upload = function(files) {
        if ($scope.component.storage && files && files.length) {
          var plugin = FormioPlugins.get('storage', $scope.component.storage);
          if (plugin) {
            $scope.fileUploads[file.name] = {
              name: file.name,
              size: file.size,
              status: 'info',
              message: 'Starting upload'
            };
            angular.forEach(files, function(file) {
              plugin.uploadFile(file);
            });
          }
          else {
            $scope.fileUploads[file.name] = {
              name: file.name,
              size: file.size,
              status: 'error',
              message: 'Storage plugin not found'
            };
          }
          switch($scope.component.storage) {
            case 's3':
              angular.forEach(files, function(file) {
                $scope.fileUploads[file.name] = {
                  name: file.name,
                  size: file.size,
                  status: 'info',
                  message: 'Starting upload'
                };
                Formio.request($scope.formio.formUrl + '/storage/s3', 'POST', {name: file.name, size: file.size, type: file.type})
                  .then(function(response) {
                    var request = {
                      url: response.url,
                      method: 'POST',
                      data: response.data
                    };
                    request.data.file = file;
                    var dir = $scope.component.dir || '';
                    request.data.key += dir + file.name;
                    var upload = Upload.upload(request);
                    upload
                      .then(function(resp) {
                        // Handle upload finished.
                        delete $scope.fileUploads[file.name];
                        $scope.data[$scope.component.key].push({
                          name: file.name,
                          storage: 's3',
                          bucket: response.bucket,
                          key: request.data.key,
                          url: response.url + request.data.key,
                          acl: request.data.acl,
                          size: file.size,
                          type: file.type
                        });
                      }, function(resp) {
                        // Handle error
                        var oParser = new DOMParser();
                        var oDOM = oParser.parseFromString(resp.data, 'text/xml');
                        $scope.fileUploads[file.name].status = 'error';
                        $scope.fileUploads[file.name].message = oDOM.getElementsByTagName('Message')[0].innerHTML;
                        delete $scope.fileUploads[file.name].progress;
                      }, function(evt) {
                        // Progress notify
                        $scope.fileUploads[file.name].status = 'progress';
                        $scope.fileUploads[file.name].progress = parseInt(100.0 * evt.loaded / evt.total);
                        delete $scope.fileUploads[file.name].message;
                      });
                  });
              });
              break;
            case 'dropbox':
              angular.forEach(files, function(file) {
                $scope.fileUploads[file.name] = {
                  name: file.name,
                  size: file.size,
                  status: 'info',
                  message: 'Starting upload'
                };
                var dir = $scope.component.dir || '';
                var dropboxToken = _.result(_.find($rootScope.user.externalTokens, {type: 'dropbox'}), 'token');
                if (!dropboxToken) {
                  $scope.fileUploads[file.name].status = 'error';
                  $scope.fileUploads[file.name].message = 'You must authenticate with dropbox before uploading files.';
                }
                else {
                  // Both Upload service and $http don't handle files as application/octet-stream which is required by dropbox.
                  var xhr = new XMLHttpRequest();

                  var onProgress = function(evt) {
                    $scope.fileUploads[file.name].status = 'progress';
                    $scope.fileUploads[file.name].progress = parseInt(100.0 * evt.loaded / evt.total);
                    delete $scope.fileUploads[file.name].message;
                    $scope.$apply();
                  };

                  xhr.upload.onprogress = onProgress;

                  xhr.onload = function(evt) {
                    if (xhr.status == 200) {
                      var resp = JSON.parse(xhr.response);
                      delete $scope.fileUploads[file.name];
                      resp.storage = 'dropbox';
                      $scope.data[$scope.component.key].push(resp);
                      $scope.$apply();
                    }
                    else {
                      $scope.fileUploads[file.name].status = 'error';
                      $scope.fileUploads[file.name].message = xhr.response || 'Unable to upload file';
                      $scope.$apply();
                    }
                  };

                  xhr.open('POST', 'https://content.dropboxapi.com/2/files/upload');
                  xhr.setRequestHeader('Authorization', 'Bearer ' + dropboxToken);
                  xhr.setRequestHeader('Content-Type', 'application/octet-stream');
                  xhr.setRequestHeader('Dropbox-API-Arg', JSON.stringify({
                    path: '/' + dir + file.name,
                    mode: 'add',
                    autorename: true,
                    mute: false
                  }));

                  xhr.send(file);
                }
              });
              break;
          }
        }
      };
    }
  ]);
  app.run([
    '$templateCache',
    function (
      $templateCache
    ) {

      $templateCache.put('formio/components/formio-file-list.html',
        '<table class="table table-striped table-bordered">' +
          '<thead>' +
            '<tr>' +
              '<td ng-if="!readOnly" style="width:1%;white-space:nowrap;"></td>' +
              '<th>File Name</th>' +
              '<th>Size</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            '<tr ng-repeat="file in files track by $index">' +
              '<td ng-if="!readOnly" style="width:1%;white-space:nowrap;"><a ng-if="!readOnly" href="#" ng-click="removeFile($event, $index)" style="padding: 2px 4px;" class="btn btn-sm btn-default"><span class="glyphicon glyphicon-remove"></span></a></td>' +
              '<td><formio-file file="file" form="form"></formio-file></td>' +
              '<td>{{ fileSize(file.size) }}</td>' +
            '</tr>' +
          '</tbody>' +
        '</table>'
      );

      $templateCache.put('formio/components/file.html',
        '<label ng-if="component.label && !component.hideLabel" for="{{ component.key }}" class="control-label" ng-class="{\'field-required\': component.validate.required}">{{ component.label }}</label>' +
        '<span ng-if="!component.label && component.validate.required" class="glyphicon glyphicon-asterisk form-control-feedback field-required-inline" aria-hidden="true"></span>' +
        '<div ng-controller="formioFileUpload">' +
          '<formio-file-list files="data[component.key]" form="formio.formUrl"></formio-file-list>' +
          '<div ng-if="!readOnly">' +
            '<div ngf-drop="upload($files)" class="fileSelector" ngf-drag-over-class="' + "'" + 'fileDragOver' + "'" + '" ngf-multiple="component.multiple"><span class="glyphicon glyphicon-cloud-upload"></span>Drop files to attach, or <a href="#" ngf-select="upload($files)" ngf-multiple="component.multiple">browse</a>.</div>' +
            '<div ng-if="!component.storage" class="alert alert-warning">No storage has been set for this field. File uploads are disabled until storage is set up.</div>' +
            '<div ngf-no-file-drop>File Drag/Drop is not supported for this browser</div>' +
          '</div>' +
          '<div ng-repeat="fileUpload in fileUploads track by $index" ng-class="{' + "'has-error'" + ': fileUpload.status === '+ "'error'" +'}" class="file">' +
            '<div class="row">' +
              '<div class="fileName control-label col-sm-10">{{ fileUpload.name }} <span ng-click="removeUpload(fileUpload.name)" class="glyphicon glyphicon-remove"></span></div>' +
              '<div class="fileSize control-label col-sm-2 text-right">{{ fileSize(fileUpload.size) }}</div>' +
            '</div>' +
            '<div class="row">' +
              '<div class="col-sm-12">' +
                '<span ng-if="fileUpload.status === ' + "'progress'" + '">' +
                  '<div class="progress">' +
                    '<div class="progress-bar" role="progressbar" aria-valuenow="{{fileUpload.progress}}" aria-valuemin="0" aria-valuemax="100" style="width:{{fileUpload.progress}}%">' +
                      '<span class="sr-only">{{fileUpload.progress}}% Complete</span>' +
                    '</div>' +
                  '</div>' +
                '</span>' +
                '<div ng-if="!fileUpload.status !== ' + "'progress'" + '" class="bg-{{ fileUpload.status }} control-label">{{ fileUpload.message }}</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }
  ]);
};
